import {Quaternion, Vector3} from 'three';
import pack from './motions/authored.json' with {type:'json'};
import {SHOTS, at, sampleHand, danceHands, welcomeHands} from './staged-gestures.mjs';

const titles = {
  idle:'Перенос веса', ...Object.fromEntries(Object.entries(SHOTS).map(([id,shot])=>[id,shot.title])),
  dance:'Танец', walk:'Ходьба',
};
export const CHOREOGRAPHY = Object.entries(titles).filter(([id])=>!SHOTS[id]?.automaticOnly).map(([id,title])=>({id,title}));
const pools = {
  idle:['idle','stretch','temples','cheek','fold','palms','nod'],
  listening:['heart','nod','fold','cheek','shrug','idle','palms'],
  thinking:['cheek','fold','options','no','shrug','point'],
  speaking:['palms','options','point','heart','nod','no','shrug','temples','cheek'],
};
const fingerCurl = {open:[.14,.045,.1,.16,.22],soft:[.22,.18,.29,.39,.47],
  loose:[.24,.43,.56,.64,.71],curled:[.39,1.12,1.22,1.25,1.27],index:[.10,.025,.94,1.03,1.08]};
const sides = ['left','right'];
const smooth = t => {t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t);};
const depth = n => n.parent ? 1+depth(n.parent) : 0;

export class ChoreographyRig {
  constructor(avatar, random = Math.random) {
    this.random=random;
    this.root=avatar.scene;
    const bone=name=>avatar.humanoid.getNormalizedBoneNode(name);
    this.basis=this.root.getWorldQuaternion(new Quaternion());
    this.inverseBasis=this.basis.clone().invert();
    this.entries=pack.bones.flatMap((name,index)=>{
      const node=bone(name);
      if (!node) return [];
      return [{name,index,node,rest:this.inverseBasis.clone().multiply(node.getWorldQuaternion(new Quaternion())),
        from:node.quaternion.clone(),localRest:node.quaternion.clone()}];
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
    this.q=new Quaternion(); this.a=new Quaternion(); this.b=new Quaternion();
    this.parent=new Quaternion(); this.inverseParent=new Quaternion(); this.rootQ=new Quaternion(); this.v=new Vector3(); this.v2=new Vector3();
    this.mode='auto'; this.clip='idle'; this.age=0; this.fade=1;
    this.history=[]; this.nextDance=45+random()*45; this.elapsed=0; this.silence=1;
    this.breathCycle=0; this.inhale=0;
    this.phase='idle'; this.enabled=false; this.holdUntil=3.6; this.direct=false;
  }
  bind(stance, targets, articulation) { Object.assign(this,{stance,targets,articulation}); }
  configure(id) {
    if(id!=='auto' && (!Object.hasOwn(titles,id) || SHOTS[id]?.automaticOnly)) id='auto';
    if(id===this.mode) return;
    this.mode=id;
    this.begin(id==='auto'?'idle':id);
  }
  get duration() { return SHOTS[this.clip]?.duration ?? (this.clip==='dance'?6 : this.clip==='walk'?4 : 4.8); }
  get title() {return titles[this.clip];}
  begin(id, direct=false) {
    this.clip=id; this.age=0; this.fade=0; this.direct=direct;
    this.fromPosition.copy(this.hips.position);
    for(const entry of this.entries) entry.from.copy(entry.node.quaternion);
    this.holdUntil=Math.max(this.duration,3+this.random()*3);
    this.history=[...this.history.filter(old=>old!==id),id].slice(-4);
  }
  replay() { this.begin(this.mode==='auto'?this.clip:this.mode,true); }
  react(kind) {
    if(this.mode!=='auto' && kind!=='dance') return;
    if(kind==='dance'){this.begin('dance',true);this.holdUntil=12;}
    else if(kind==='greeting')this.begin('welcome',true);
    else if(kind==='touch')this.begin(this.clip==='temples'?'heart':'temples',true);
  }
  choose(phase) {
    if((phase==='idle'||phase==='speaking') && this.elapsed>=this.nextDance){
      this.nextDance=this.elapsed+45+this.random()*45;
      return this.random()<.5?'skip':'dance';
    }
    const candidates=pools[phase].filter(id=>!this.history.includes(id));
    return candidates[Math.floor(this.random()*candidates.length)];
  }
  update(dt,{phase='idle',audio=0,reduced=false}={}) {
    if(!this.enabled){this.enabled=true;this.begin(this.mode==='auto'?'idle':this.mode);}
    dt=Math.max(0, Math.min(.05,dt));
    if(reduced){
      if(this.clip!=='idle')this.begin('idle');
      this.breathCycle=0;this.inhale=0;
      this.age=0;this.fade+=dt;this.wasReduced=true;this.renderPose();return;
    }
    if(this.wasReduced){this.wasReduced=false;this.begin(this.mode==='auto'?'idle':this.mode);}
    this.elapsed+=dt;this.silence=audio>.025?0:this.silence+dt;
    const state=phase==='speaking'&&this.silence>.8?'listening':phase;
    const changed=state!==this.phase;
    this.phase=state;
    if(this.mode!=='auto' && this.direct && this.clip!==this.mode && this.age>=this.holdUntil) {
      this.begin(this.mode);
    }
    if(this.mode==='auto' && (this.age>=this.holdUntil || (changed&&!this.direct&&this.age>.55))){
      this.begin(this.choose(state));
    }
    const period=this.clip==='dance'||this.clip==='walk'?3.2:phase==='speaking'?4.2:4.9;
    this.breathCycle=(this.breathCycle+dt/period)%1;
    const b=this.breathCycle;
    this.inhale=b<.38?smooth(b/.38):1-smooth((b-.38)/.62);
    this.age+=dt;this.fade+=dt;this.renderPose();
  }
  renderPose() {
    const shot=SHOTS[this.clip];
    const source=(this.clip==='walk'||this.clip==='dance')?this.clip:'idle';
    // All staged gestures share frame zero of the retargeted idle clip.
    // Store it in local bone space so it remains valid on a rotated turntable.
    if (shot && this.stageBase) {
      this.hips.position.copy(this.stageBase.position);
      for (let i=0;i<this.entries.length;i++) this.entries[i].node.quaternion.copy(this.stageBase.rotations[i]);
    } else {
      this.sampleSource(source,shot?0:this.age);
      if (shot) this.stageBase = {position:this.hips.position.clone(),rotations:this.entries.map(e=>e.node.quaternion.clone())};
    }
    if(this.stance && source==='idle')this.stage(shot);
    if(source==='dance' && this.stance)this.stageDance();
    if(source==='walk')this.breathe();
    // Crossfade *after* solving both arms and the support foot so their
    // transition starts at the actual previous displayed pose.
    const blend=smooth(this.fade/.4);
    if(blend<1) {
      this.hips.position.lerp(this.fromPosition,1-blend);
      for(const e of this.entries)e.node.quaternion.slerp(e.from,1-blend);
    }
  }
  sampleSource(id,t) {
    const c=pack.clips[id],frame=Math.min(c.frames-1,(t%c.duration)*c.fps);
    const i=Math.floor(frame),j=Math.min(c.frames-1,i+1),u=frame-i;
    this.root.getWorldQuaternion(this.rootQ);
    this.v.fromArray(c.positions,i*3).lerp(this.v2.fromArray(c.positions,j*3),u)
      .multiplyScalar(this.scale).applyQuaternion(this.inverseBasis);
    this.hips.position.copy(this.origin).add(this.v);
    for(const e of this.entries){
      const offset=e.index*4,stride=pack.bones.length*4;
      this.a.fromArray(c.rotations,i*stride+offset).normalize();
      this.b.fromArray(c.rotations,j*stride+offset).normalize();
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
    const open=rise(.12,.46)-rise(1.38,1.74);
    const tap=rise(.62,.85)-rise(1.08,1.30);
    const lift=(a,b)=>beat>a&&beat<b?Math.sin(Math.PI*(beat-a)/(b-a))**2:0;
    const leadLift=lift(.10,.48)+lift(1.36,1.76);
    const heel=lift(.57,1.33);
    const pose={hipsSide:(lead==='left'?-1:1)*(.021*tap-.011*leadLift),
      hipsDrop:.014+.013*lift(.33,.7)+.011*lift(1.12,1.57),
      hipsYaw:(lead==='left'?-1:1)*.052*open,
      [lead+'FootSide']:.119+.052*open,[follow+'FootSide']:.119-.026*tap,
      [lead+'FootForward']:.020*open,[follow+'FootForward']:-.012*tap,
      [lead+'FootLift']:.038*leadLift,[follow+'FootLift']:.025*heel,
      [lead+'Knee']:.28*leadLift,[follow+'Knee']:.42*heel,
      [lead+'FootPitch']:.12*leadLift,[follow+'FootPitch']:.18*heel};
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
    this.fillFingers(pose,hands);
    this.articulation.apply(pose,hands);
    this.breathe();
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
    if(this.clip==='welcome') welcomeHands(t,hands,pose);
    this.stance.apply(pose);
    this.fillFingers(pose,hands);
    this.articulation.apply(pose);
    this.nodes.spine?.rotateX(this.wasReduced ? 0 : .012*breath);
    this.nodes.spine?.rotateZ(-lean*.35-.031*balance);
    this.nodes.chest?.rotateY(turn*.55); this.nodes.chest?.rotateZ(lean*.25);
    this.nodes.neck?.rotateX(pitch*.25+.04*at(shot?.dip,t-.08));this.nodes.head?.rotateX(pitch*.75);
    this.nodes.head?.rotateZ((shot?.lean??0)*headBeat);this.nodes.head?.rotateY(turn*.5+at(shot?.yaw,t));
    this.breathe();
    this.targets.apply({},hands);
  }
}
