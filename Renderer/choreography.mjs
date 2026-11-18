import {Quaternion, Vector3} from 'three';
import pack from './motions/authored.json' with {type:'json'};
import {SHOTS, at, sampleHand, danceHands, welcomeHands} from './staged-gestures.mjs';
import {guideHands,referencePose} from './reference-poses.mjs';
import {NAYU_CHOREOGRAPHY,NAYU_IDLE,musicMotion} from './nayu-motion.mjs';

const titles = {
  idle:'Перенос веса', ...Object.fromEntries(Object.entries(SHOTS).map(([id,shot])=>[id,shot.title])),
  dance:'Танец', walk:'Ходьба',
  jog:'Бег трусцой', sprint:'Быстрый бег',
  chair:'Садится на стул и встаёт', chairIdle:'Сидит на стуле', jump:'Прыжок и приземление',
  airborne:'В воздухе', landing:'Приземление',
};
export const CHOREOGRAPHY = Object.entries(titles).filter(([id])=>!SHOTS[id]?.automaticOnly).map(([id,title])=>({id,title}));
const pools = {
  idle:['idle','cheek','fold','nod','palms','temples','heart'],
  listening:['heart','nod','fold','cheek','shrug','idle','palms','temples'],
  thinking:['cheek','fold','options','no','shrug','point','temples','nod'],
  speaking:['palms','options','point','heart','nod','no','shrug','temples','cheek'],
};
const sourceSequences = {
  jog: [{ id:'jog', loop:true }],
  sprint: [{ id:'sprint', loop:true }],
  chair: [{ id:'chairIn' }, { id:'chairIdle', loop:true, hold:2.8 }, { id:'chairOut' }],
  chairIdle: [{ id:'chairIdle', loop:true }],
  jump: [{ id:'jumpStart' }, { id:'jumpAir', hold:.6 }, { id:'jumpLand' }],
  airborne: [{ id:'jumpAir', loop:true }],
  landing: [{ id:'jumpLand' }],
  desktopChair: [{ id:'chairIn' }, { id:'chairIdle', loop:true }],
  chairRise: [{ id:'chairOut' }],
};
const nayuTitles = Object.fromEntries(NAYU_CHOREOGRAPHY.map(({id,title})=>[id,title]));
const fingerCurl = {open:[.14,.045,.1,.16,.22],soft:[.22,.18,.29,.39,.47],
  loose:[.24,.43,.56,.64,.71],curled:[.39,1.12,1.22,1.25,1.27],index:[.10,.025,.94,1.03,1.08]};
const sides = ['left','right'];
const smooth = t => {t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t);};
const depth = n => n.parent ? 1+depth(n.parent) : 0;

export class ChoreographyRig {
  /** @param {import('./nayu-motion.mjs').NayuMotion | null} nayu */
  constructor(avatar, random = Math.random, nayu = null) {
    this.random=random;
    this.nayu=nayu;
    this.root=avatar.scene;
    const bone=name=>avatar.humanoid.getNormalizedBoneNode(name);
    this.basis=this.root.getWorldQuaternion(new Quaternion());
    this.inverseBasis=this.basis.clone().invert();
    this.entries=pack.bones.flatMap((name,index)=>{
      const node=bone(name);
      if (!node) return [];
      return [{name,index,node,rest:this.inverseBasis.clone().multiply(node.getWorldQuaternion(new Quaternion())),
        from:node.quaternion.clone(),previous:node.quaternion.clone(),axis:new Vector3(),speed:0,
        localRest:node.quaternion.clone(), localPosition:node.position.clone(),
        fromPosition:node.position.clone(), restParent:node.parent.getWorldQuaternion(new Quaternion()).invert()}];
    }).sort((a,b)=>depth(a.node)-depth(b.node));
    const byNode=new Map(this.entries.map(entry=>[entry.node,entry]));
    for (const entry of this.entries) {
      entry.parentEntry=byNode.get(entry.node.parent);
      entry.world=new Quaternion();
      entry.finger=/Thumb|Index|Middle|Ring|Little/.test(entry.name);
    }
    this.nodes=Object.fromEntries(this.entries.map(e=>[e.name,e.node]));
    this.hips=this.nodes.hips;
    this.origin=this.hips.position.clone();
    this.scale=this.hips.getWorldPosition(new Vector3()).y;
    this.fromPosition=this.origin.clone();
    this.previousPosition=this.origin.clone();this.hipVelocity=new Vector3();this.previousDt=0;
    this.q=new Quaternion(); this.a=new Quaternion(); this.b=new Quaternion();
    this.parent=new Quaternion(); this.inverseParent=new Quaternion(); this.rootQ=new Quaternion(); this.v=new Vector3(); this.v2=new Vector3();
    this.viewOffset=0;this.priorViewOffset=0;
    this.mode='auto'; this.clip='idle'; this.age=0; this.fade=1;
    this.history=[]; this.elapsed=0; this.silence=1;
    this.seated=false; this.track=null;
    this.desktopAction=''; this.musicTime=0; this.musicRate=1;
    this.breathCycle=0; this.inhale=0;
    this.phase='idle'; this.enabled=false; this.holdUntil=3.6; this.direct=false;
  }
  bind(stance, targets, articulation) { Object.assign(this,{stance,targets,articulation}); }
  configure(id) {
    if(id!=='auto' && (!Object.hasOwn(titles,id) || SHOTS[id]?.automaticOnly) &&
        !(this.nayu && Object.hasOwn(nayuTitles,id))) id='auto';
    if(id===this.mode) return;
    this.mode=id;
    if (!this.desktopAction && !this.seated && this.clip !== 'chairRise') this.begin(id==='auto'?'idle':id);
  }
  setSeated(value) {
    if (this.seated === value) return;
    this.seated = value;
    if (!this.desktopAction) this.begin(value ? 'desktopChair' : 'chairRise', true);
  }
  get desktopSeating() { return this.clip === 'desktopChair' || this.clip === 'chairRise' || (this.seated && this.desktopAction === 'music'); }
  sequence(id) { return this.nayu?.sequences[id] ?? sourceSequences[id]; }
  segmentDuration(action) {
    return (action.cycles||1)*this.trackDuration(action.id)/(action.rate||1);
  }
  trackDuration(id) {
    const motion = this.nayu?.clips[id] || pack.clips[id];
    return motion.duration/(motion.speed||1);
  }
  segmentAt(sequence, time) {
    for (const [index,action] of sequence.entries()) {
      const hold = action.hold ?? this.segmentDuration(action);
      if (time<hold || index===sequence.length-1) return { ...action,time };
      time-=hold;
    }
  }
  get fullBodyPreview() { return Boolean(this.sequence(this.clip)) && !this.desktopSeating; }
  get duration() {
    const sequence = this.sequence(this.clip);
    if (sequence) return sequence.reduce((time, action) => time + (action.hold ?? this.segmentDuration(action)), 0);
    return SHOTS[this.clip]?.duration ?? (this.clip==='dance'?6 : this.clip==='walk'?4 : 4.8);
  }
  get title() { return this.clip==='chairRise'?'Встаёт со стула':titles[this.clip] ?? nayuTitles[this.clip] ?? titles.chairIdle; }
  prepareTransition(dt) {
    this.fade=0;
    this.fromPosition.copy(this.hips.position);
    this.hipVelocity.subVectors(this.fromPosition,this.previousPosition)
      .multiplyScalar(dt>0?1/dt:0).clampLength(0,this.scale*2);
    for(const entry of this.entries){
      entry.from.copy(entry.node.quaternion);
      entry.fromPosition.copy(entry.node.position);
      entry.speed=0;
      if(dt>0){
        this.q.copy(entry.previous).invert().multiply(entry.from);
        entry.axis.set(this.q.x,this.q.y,this.q.z);
        const length=entry.axis.length();
        if(length>1e-8){
          entry.axis.multiplyScalar((this.q.w<0?-1:1)/length);
          entry.speed=Math.min(16,2*Math.atan2(length,Math.abs(this.q.w))/dt);
        }
      }
    }
  }
  begin(id, direct=false) {
    const dt=this.enabled && !this.wasReduced ? this.previousDt : 0;
    this.enabled=true;
    this.priorViewOffset=this.viewOffset;
    this.clip=id; this.age=0; this.direct=direct; this.track=null;
    this.targets?.resetTwist();
    this.stance?.beginTransfer(dt>0 && !this.sequence(id));
    this.prepareTransition(dt);
    this.holdUntil=id==='chairRise'?this.duration:id==='idle'?9+this.random()*8:Math.max(this.duration,3+this.random()*3);
    this.history=[...this.history.filter(old=>old!==id),id].slice(-4);
  }
  replay() { if (!this.desktopAction && !this.desktopSeating) this.begin(this.mode==='auto'?this.clip:this.mode,true); }
  react(kind) {
    if(this.desktopAction || this.desktopSeating || (this.mode!=='auto' && kind!=='dance')) return;
    if(kind==='dance'){this.begin(this.nayu?'nayu_dance':'dance',true);this.holdUntil=this.nayu?this.duration:12;}
    else if(kind==='greeting')this.begin(this.nayu?'nayu_greet':'welcome',true);
    else if(kind==='arrival')this.begin(this.nayu?'nayu_welcome':'arrival',true);
    else if(kind==='touch')this.begin(this.clip==='temples'?'heart':'temples',true);
  }
  reactToMeaning(clip) {
    if (this.mode==='auto' && !this.desktopAction && !this.desktopSeating && Object.hasOwn(SHOTS,clip))
      this.begin(clip,true);
  }
  updateDesktopAction(next, bpm, clipStep) {
    if (!this.nayu) return;
    const previous = this.desktopAction;
    const music = next === 'music' ? musicMotion(bpm,this.seated) : null;
    if (next !== previous || (music && this.clip !== music.clip)) {
      this.desktopAction = next;
      if (music) {
        this.musicTime=0; this.musicRate=music.rate;
        this.begin(music.clip,true);
      } else if (next === 'drag') this.begin('nayu_drag',true);
      else if (next === 'depart') this.begin('nayu_farewell',true);
      else if(this.seated) this.begin('desktopChair',true);
      else if(previous==='music' && this.mode==='auto') {
        this.begin('nayu_dance_out',true);
        this.holdUntil=this.duration;
      } else this.begin(this.mode==='auto'?'idle':this.mode);
    }
    this.music = music;
    if (music) {
      this.musicRate += (music.rate-this.musicRate)*Math.min(1,clipStep*5);
      this.musicTime += clipStep*this.musicRate;
    }
  }
  choose(phase) {
    if(this.nayu && (phase==='idle'||phase==='listening')) {
      const candidates = NAYU_IDLE.filter(({id})=>!this.history.includes(id));
      let draw = this.random()*candidates.reduce((total, item)=>total+item.weight,0);
      for (const item of candidates) {
        draw-=item.weight;
        if (draw<0) return item.id;
      }
      return candidates.at(-1)?.id || 'nayu_idle_breathe';
    }
    if(phase==='idle' && this.clip!=='idle')return 'idle';
    const candidates=pools[phase].filter(id=>!this.history.includes(id));
    if(!candidates.length)return this.history.find(id=>pools[phase].includes(id));
    return candidates[Math.floor(this.random()*candidates.length)];
  }
  update(dt,{phase='idle',audio=0,reduced=false,playbackDelta=NaN,dragging=false,departing=false,bpm=0}={}) {
    if(!this.enabled)this.begin(this.seated?'desktopChair':this.mode==='auto'?'idle':this.mode);
    dt=Math.max(0, Math.min(.05,dt));
    const clipStep=Number.isFinite(playbackDelta)?Math.max(0,Math.min(1.5,playbackDelta)):dt;
    if(reduced){
      this.desktopAction=''; this.music=null;
      if(this.clip!=='idle')this.begin('idle');
      this.breathCycle=0;this.inhale=0;
      this.age=0;this.fade+=dt;this.wasReduced=true;
      this.stance?.beginTransfer(false);this.renderPose(0);return;
    }
    if(this.wasReduced){this.wasReduced=false;this.begin(this.seated?'desktopChair':this.mode==='auto'?'idle':this.mode);}
    this.elapsed+=clipStep;this.silence=audio>.025?0:this.silence+clipStep;
    const state=phase==='speaking'&&this.silence>.8?'listening':phase;
    const changed=state!==this.phase;
    this.phase=state;
    this.updateDesktopAction(departing ? 'depart' : dragging ? 'drag' :
      bpm && (phase==='idle'||phase==='listening') ? 'music' : '',bpm,clipStep);
    if (!this.desktopAction && !this.seated) {
      if (this.clip==='chairRise' && this.age>=this.holdUntil)
        this.begin(this.mode==='auto'?'idle':this.mode);
      else if(this.mode!=='auto' && this.direct && this.clip!==this.mode && this.age>=this.holdUntil)
        this.begin(this.mode);
      else if(this.mode==='auto' && !this.desktopSeating &&
          (this.age>=this.holdUntil || (changed&&!this.direct&&this.age>.55)))
        this.begin(changed && state==='idle'?'idle':this.choose(state));
    }
    const period=this.clip==='dance'||this.clip==='walk'?3.2:phase==='speaking'?4.2:4.9;
    this.breathCycle=(this.breathCycle+dt/period)%1;
    const b=this.breathCycle;
    this.inhale=b<.38?smooth(b/.38):1-smooth((b-.38)/.62);
    this.age+=clipStep;this.fade+=clipStep;this.renderPose(dt);
  }
  renderPose(dt) {
    const sequence = this.sequence(this.clip);
    const segment = this.music ? {id:this.music.clip,time:this.musicTime,loop:true} :
      sequence ? this.segmentAt(sequence, this.age) : null;
    if (segment && this.track && this.track !== segment.id) this.prepareTransition(this.previousDt);
    this.track = segment?.id;
    this.previousDt=dt;
    this.previousPosition.copy(this.hips.position);
    for(const entry of this.entries)entry.previous.copy(entry.node.quaternion);
    const shot=SHOTS[this.clip];
    const targetView=at(shot?.view,this.age);
    this.viewOffset=this.wasReduced ? 0 : this.clip==='arrival' ? targetView :
      this.priorViewOffset+(targetView-this.priorViewOffset)*smooth(this.fade/.4);
    const source=segment?.id ?? ((this.clip==='walk'||this.clip==='dance')?this.clip:'idle');
    // All staged gestures share frame zero of the retargeted idle clip.
    // Store it in local bone space so it remains valid on a rotated turntable.
    if (shot && this.stageBase) {
      this.hips.position.copy(this.stageBase.position);
      for (let i=0;i<this.entries.length;i++) {
        const entry = this.entries[i];
        entry.node.quaternion.copy(this.stageBase.rotations[i]);
        if (entry.node !== this.hips) entry.node.position.copy(entry.localPosition);
      }
    } else {
      this.sampleSource(source,segment ? segment.time*(segment.rate||1) : shot?0:this.age,segment?.loop ?? Boolean(!segment || this.nayu?.clips[source]?.loop));
      if (this.clip === 'jump' && source === 'jumpAir') {
        // The imported game clip is in-place. Add root travel only in the composite preview.
        const progress = segment.time / segment.hold;
        this.hips.position.y += 1.36 * this.scale * progress * (1 - progress);
      }
      if (shot) this.stageBase = {position:this.hips.position.clone(),rotations:this.entries.map(e=>e.node.quaternion.clone())};
    }
    if(this.stance && source==='idle')this.stage(shot);
    if(source==='dance' && this.stance)this.stageDance();
    if(source==='walk')this.breathe();
    this.stance?.sampleLanding();
    // Crossfade *after* solving both arms and the support foot so their
    // transition starts at the actual previous displayed pose.
    const fadeTime = this.nayu?.clips[source]?.fade ?? (this.clip==='arrival'?.12:sequence?.length>1?.24:.4);
    const blend=fadeTime<=0 ? 1 : smooth(this.fade/fadeTime);
    if(blend<1) {
      // Carry the displayed velocity through an interruption, then let it die
      // away. Replaying from a static snapshot stalls a moving hand for a frame.
      const coast=this.wasReduced?0:this.fade*Math.exp(-this.fade/.08);
      this.hips.position.lerp(this.v.copy(this.fromPosition).addScaledVector(this.hipVelocity,coast),1-blend);
      for(const e of this.entries){
        this.a.copy(e.from).multiply(this.q.setFromAxisAngle(e.axis,e.speed*coast));
        e.node.quaternion.slerp(this.a,1-blend);
        if (e.node !== this.hips) e.node.position.lerp(e.fromPosition,1-blend);
      }
    }
    this.stance?.transferFeet(this.fade);
    if (sequence && !this.desktopSeating) {
      const hipOffset = (this.hips.position.y - this.origin.y) / this.scale;
      // Astra's seated dance has the seat-origin offset baked into it.
      const minimum = this.track === 'nayu_sit_dance_loop' ? -1 : -.16;
      this.viewOffset = Math.max(minimum, Math.min(.16, hipOffset * .65));
    }
  }
  sampleSource(id,t,loop=true) {
    const imported = this.nayu?.clips[id];
    const clip = imported || pack.clips[id];
    const elapsed = t*(clip.speed || 1);
    const time = loop ? elapsed%clip.duration : Math.min(elapsed,clip.duration);
    const frame = imported ? 0 : Math.min(clip.frames-1,time*clip.fps);
    const i=Math.floor(frame),j=Math.min(clip.frames-1,i+1);
    const keys = imported ? this.nayu.blend(clip,time) : null;
    const u=keys ? keys.alpha : frame-i;
    this.root.getWorldQuaternion(this.rootQ);
    if (keys) {
      this.nayu.position(keys.from,this.v);
      this.nayu.position(keys.to,this.v2);
    } else {
      this.v.fromArray(clip.positions,i*3);
      this.v2.fromArray(clip.positions,j*3);
    }
    this.v.lerp(this.v2,u).multiplyScalar(this.scale).applyQuaternion(this.inverseBasis);
    this.hips.position.copy(this.origin).add(this.v);
    for(const e of this.entries){
      const offset=e.index*4,stride=pack.bones.length*4;
      if (keys) {
        this.nayu.rotation(keys.from,e.index,this.a);
        this.nayu.rotation(keys.to,e.index,this.b);
        if (e.node !== this.hips) {
          this.nayu.translation(keys.from,e.index,this.v);
          this.nayu.translation(keys.to,e.index,this.v2);
          e.node.position.copy(e.localPosition).add(this.v.lerp(this.v2,u).multiplyScalar(this.scale).applyQuaternion(e.restParent));
        }
      } else {
        if (e.node !== this.hips) e.node.position.copy(e.localPosition);
        this.a.fromArray(clip.rotations,i*stride+offset).normalize();
        this.b.fromArray(clip.rotations,j*stride+offset).normalize();
      }
      this.q.copy(this.a).slerp(this.b,u).premultiply(this.inverseBasis)
        .multiply(this.basis).multiply(e.rest).premultiply(this.rootQ);
      // Normalized VRM bones are unscaled. Parent entries have already been
      // sampled in hierarchy order, including their local finger relaxation.
      if(e.parentEntry)this.parent.copy(e.parentEntry.world);
      else e.node.parent.getWorldQuaternion(this.parent);
      this.inverseParent.copy(this.parent).invert();
      e.node.quaternion.copy(this.q.premultiply(this.inverseParent)).normalize();
      if(id==='idle' && e.finger)e.node.quaternion.slerp(e.localRest,.75);
      e.world.multiplyQuaternions(this.parent,e.node.quaternion);
    }
  }
  fillFingers(pose,hands) {
    for(const side of sides){
      const hand=hands[side],w=hand?.fingerWeight??hand?.weight??0,shape=fingerCurl[hand?.shape??'soft'];
      pose[side+'Spread']=.02+.055*w;
      pose[side+'ThumbOpposition']=.14-.06*w;
      ['Thumb','Index','Middle','Ring','Little'].forEach((finger,index)=>{
        for(const [joint,factor] of [.75,.92,.56].entries())
          pose[side+finger+joint]=(.16+(shape[index]-.16)*w)*factor;
      });
    }
  }
  breathe() {
    const ribcage=this.nodes.upperChest ?? this.nodes.chest;
    ribcage?.rotateX(.029*this.inhale);
    this.nodes.neck?.rotateX(-.014*this.inhale);
  }
  stageDance() {
    const t=this.age, beat=t%2;
    const lead=Math.floor(t/2)%2===0?'left':'right';
    const follow=lead==='left'?'right':'left';
    // One foot opens the stance, accepts weight, then the trailing heel lifts.
    // Horizontal offsets change only during swing. Alternating the lead gives
    // both legs a support phase with the foot fixed relative to the floor.
    const rise=(a,b)=>smooth((beat-a)/(b-a));
    const phrase=t%6, accent=phrase<2;
    const returnStart=accent?1.69:1.38, returnEnd=accent?1.98:1.74;
    const open=rise(.12,.46)-rise(returnStart,returnEnd);
    const tap=rise(.62,.85)-rise(1.08,1.30);
    const lift=(a,b)=>beat>a&&beat<b?Math.sin(Math.PI*(beat-a)/(b-a))**2:0;
    const leadLift=lift(.10,.48)+lift(returnStart,returnEnd);
    const heel=lift(.57,1.33);
    const pose={hipsSide:(lead==='left'?-1:1)*(.021*tap-.011*leadLift),
      hipsDrop:.014+.013*lift(.33,.7)+.011*lift(1.12,1.57),
      hipsYaw:(lead==='left'?-1:1)*.052*open,
      [lead+'FootSide']:.119+.052*open,[follow+'FootSide']:.119-.026*tap,
      [lead+'FootForward']:.020*open,[follow+'FootForward']:-.012*tap,
      [lead+'FootLift']:.038*leadLift,[follow+'FootLift']:.025*heel,
      leftHeelRoll:0,rightHeelRoll:0,leftToeContact:1,rightToeContact:1,
      [lead+'Knee']:.28*leadLift,[follow+'Knee']:.42*heel,
      [lead+'FootPitch']:.12*leadLift,[follow+'FootPitch']:.18*heel};
    // After the accent the trailing foot closes under the body. The lead
    // stays down until contact; the next phrase opens from that same stance.
    const closing=Math.floor(t/6)%2===0?'right':'left';
    const enter=smooth((phrase-1.30)/.29), leave=smooth((phrase-2.06)/.40);
    const close=enter-leave;
    const swing=Math.sin(Math.PI*enter)**2+Math.sin(Math.PI*leave)**2;
    pose[closing+'FootSide']-=.243*close;
    // The toe lands before the heel. During the short roll on either side
    // of the flight, the forefoot remains in contact with the floor.
    const roll=smooth((phrase-1.22)/.18)-smooth((phrase-1.50)/.18)
      +smooth((phrase-2.00)/.16)-smooth((phrase-2.32)/.17);
    pose[closing+'FootLift']+=.014*swing;
    pose[closing+'HeelRoll']=.32*roll;
    pose[closing+'ToeContact']=1-swing;
    pose.hipsSide+=(closing==='right'?-1:1)*.085*close;
    if(accent)pose.hipsSide+=(lead==='left'?-1:1)*.061*(rise(.29,.65)-rise(.85,1.13));
    this.stance.apply(pose);
    // Counterbalance the open step. The chest turns into the step and the
    // head follows on the weight transfer, keeping the eyes near the horizon.
    const side=lead==='left'?-1:1;
    const gather=Math.floor(t/2)%3===0 ? rise(.18,.55)-rise(.8,1.05) : 0;
    const sweep=Math.floor(t/2)%3===0 ? rise(1.07,1.39)-rise(1.68,1.97) : 0;
    this.nodes.chest?.rotateY(side*(-.12*open+.18*gather-.25*sweep));
    this.nodes.chest?.rotateX(.075*gather-.055*sweep);
    this.nodes.spine?.rotateZ(side*(.045*tap-.025*leadLift));
    this.nodes.neck?.rotateY(side*.035*tap);
    this.nodes.head?.rotateZ(-side*.036*tap);
    const hands=danceHands(t);
    const reference=referencePose('dance',t);
    guideHands(hands,reference);
    this.fillFingers(pose,hands);
    this.articulation.apply(pose,hands);
    this.breathe();
    if(reference)this.targets.referenceFrame?.align(reference,this.nodes);
    this.targets.apply({},hands);
  }
  stage(shot) {
    const t=this.age, hands={left:sampleHand(shot?.left,t),right:sampleHand(shot?.right,t,at(shot?.swing,t),at(shot?.wrist,t))};
    const left=hands.left?.weight??0,right=hands.right?.weight??0;
    // Weight and shoulder girdle lead the reaching hand. The head settles
    // after the torso; this order also applies on the return to rest.
    const leftLead=at(shot?.left?.envelope,t+.095), rightLead=at(shot?.right?.envelope,t+.095);
    const weight=Math.max(left,right), bodyBeat=shot?.alternate?leftLead-rightLead:Math.max(leftLead,rightLead);
    const headBeat=shot?.alternate?left-right:weight;
    const lean=(shot?.lean??0)*bodyBeat,turn=(shot?.turn??0)*bodyBeat;
    const foot=at(shot?.foot,t),pitch=at(shot?.pitch,t)+(shot?.bow??0)*weight;
    const breath=Math.sin(2*Math.PI*this.elapsed/4.6);
    const settle=shot ? .0035*breath : .010*Math.sin(2*Math.PI*t/4.8);
    const idleShift=(this.wasReduced ? 0 : settle);
    const dip=at(shot?.dip,t), balance=at(shot?.balance,t);
    const pose={hipsSide:idleShift-lean*.15+.013*balance, hipsDrop:.008+.008*weight+.01*foot+.026*dip,
      hipsRoll:-lean*.23,hipsYaw:turn*.24,leftFootSide:.032,rightFootSide:.028,
      leftFootForward:.012,rightFootForward:-.014,leftFootLift:foot*.038,leftKnee:foot*.45,leftFootPitch:foot*.15,
      leftShoulderLift:leftLead*(shot?.shoulder??.075),rightShoulderLift:rightLead*(shot?.shoulder??.075),
      leftShoulderForward:leftLead*.09,rightShoulderForward:rightLead*.09};
    if(this.clip==='templeDance'){
      // The first side step widens the base. The soles stay planted while
      // the pelvis crosses between them during the repeated upper-body phrase.
      for(const [i,side] of sides.entries()){
        const step=smooth((t-.08-i*.22)/.37);
        pose[side+'FootSide']+=.085*step;
        pose[side+'FootLift']+=.026*Math.sin(Math.PI*step)**2;
      }
      const swing=Math.cos((t-.68)*Math.PI/.95)*smooth((t-.20)/.48);
      pose.hipsSide+=.043*swing;
      pose.hipsDrop+=.009*(1-Math.abs(swing));
      pose.hipsRoll+=.048*swing;
      pose.leftKnee+=.14*Math.max(0,swing);
      pose.rightKnee+=.14*Math.max(0,-swing);
    }
    if(shot?.floor){
      const settle=at(shot.floor,t);
      pose.floorSeat=settle;
      pose.hipsDrop+=settle*.42;
      pose.hipsForward=-.018*settle;
      // The feet tuck in succession so the ankles pass at different heights.
      for(const [i,side] of sides.entries()){
        const fold=smooth((t-.13-i*.09)/.66);
        pose[side+'FootSide']-=.073*fold;
        pose[side+'FootForward']+=(i?.159:.103)*fold;
        pose[side+'FootLift']=(i?.043:.026)*fold+.050*Math.sin(Math.PI*fold)**2;
        pose[side+'FootRoll']=(i?1:-1)*.19*fold;
      }
    }
    if(this.clip==='welcome') welcomeHands(t,hands,pose);
    if(this.clip==='cheek' || this.clip==='fold'){
      const cheek=this.clip==='cheek', enter=smooth((t-.18)/.59);
      const leave=smooth((t-(cheek?3.00:3.58))/.68), shift=enter-leave;
      const swing=Math.sin(Math.PI*enter)**2+Math.sin(Math.PI*leave)**2;
      pose.hipsSide+=(cheek?.070:.012)*shift;
      pose.leftFootSide+=(cheek?.007:-.084)*shift;
      pose.leftFootForward-=(cheek?.064:.025)*shift;
      pose.leftFootLift+=.022*swing;
      pose.leftFootPitch+=(cheek?.11:.035)*shift;
      pose.leftKnee+=(cheek?.23:.06)*shift;
      pose.leftKneeIn=(cheek?.55:.23)*shift;
    }
    const reference=this.wasReduced?undefined:referencePose(this.clip,t);
    guideHands(hands,reference);
    this.stance.apply(pose);
    this.fillFingers(pose,hands);
    this.articulation.apply(pose);
    this.nodes.spine?.rotateX(this.wasReduced ? 0 : .012*breath);
    this.nodes.spine?.rotateZ(-lean*.35-.031*balance);
    this.nodes.chest?.rotateY(turn*.55); this.nodes.chest?.rotateZ(lean*.25);
    this.nodes.neck?.rotateX(pitch*.25+.04*at(shot?.dip,t-.08));this.nodes.head?.rotateX(pitch*.75);
    this.nodes.head?.rotateZ((shot?.lean??0)*headBeat);this.nodes.head?.rotateY(turn*.5+at(shot?.yaw,t));
    this.breathe();
    if(reference)this.targets.referenceFrame?.align(reference,this.nodes);
    this.targets.apply({},hands);
  }
}
