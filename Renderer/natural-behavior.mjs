// Event-based secondary acting. Randomness is chosen at event boundaries only;
// no per-frame joint jitter, no fabricated speech or inferred user emotion.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);};
const envelope=(age,duration)=>smooth(age/(duration*.23))*(1-smooth((age-duration*.62)/(duration*.38)));
const titles={quiet:'Спокойная пауза',release:'Расслабляет пальцы',palm:'Небольшой жест ладонью',wrist:'Расслабляет кисть',shoulder:'Меняет положение плеч',foot:'Разгружает стопу',nod:'Короткий кивок',pinch:'Слегка сводит пальцы',stretch:'Раскрывает кисть'};
export class NaturalBehavior {
  constructor(seed=0x6d697261){
    this.seed=(seed>>>0)||1;this.time=0;this.phase='idle';this.event=null;this.lastEvent='';
    this.nextEvent=2;this.nextPosture=1;this.posture=0;this.postureFrom=0;this.postureTo=0;this.postureAge=0;
    this.nextGaze=1.4;this.gazeAge=0;this.gazeFrom={x:0,y:0};this.gaze={x:0,y:0};this.gazeTo={x:0,y:0};
    this.breathAge=0;this.breathLength=5.4;this.nextBlink=3.1;this.blinkAge=Infinity;this.doubleBlink=false;
    this.enabledAge=0;this.label=titles.quiet;
  }
  random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
  range(a,b){return a+(b-a)*this.random();}
  tick(dt,phase){
    this.time+=dt;this.enabledAge+=dt;this.postureAge+=dt;this.gazeAge+=dt;this.breathAge+=dt;this.blinkAge+=dt;
    if(phase!==this.phase){this.phase=phase;this.nextEvent=this.time+this.range(.7,1.6);this.nextGaze=this.time+.15;this.event=null;}
    if(this.breathAge>=this.breathLength){this.breathAge-=this.breathLength;this.breathLength=this.range(4.6,6.8);}
    if(this.time>=this.nextPosture){this.postureFrom=this.posture;this.postureTo=this.range(-.009,.009);this.postureAge=0;this.nextPosture=this.time+this.range(9,18);}
    this.posture=this.postureFrom+(this.postureTo-this.postureFrom)*smooth(this.postureAge/2.4);
    if(this.time>=this.nextGaze){
      this.gazeFrom={...this.gaze};this.gazeAge=0;
      const away=this.random()<(phase==='thinking'?.72:phase==='listening'?.18:.36);
      this.gazeTo={x:away?this.range(-17,17):this.range(-2.4,2.4),y:away?this.range(-7,9):this.range(-1.5,1.5)};
      this.nextGaze=this.time+(away?this.range(.8,1.9):this.range(2.4,5.6));
      if(away&&this.random()<.45)this.nextBlink=this.time+.08;
    }
    const gazeMix=smooth(this.gazeAge/.13);
    this.gaze.x=this.gazeFrom.x+(this.gazeTo.x-this.gazeFrom.x)*gazeMix;
    this.gaze.y=this.gazeFrom.y+(this.gazeTo.y-this.gazeFrom.y)*gazeMix;
    if(this.time>=this.nextBlink){this.blinkAge=0;const pair=!this.doubleBlink&&this.random()<.12;this.nextBlink=this.time+(pair?.29:this.range(2.7,6.4));this.doubleBlink=pair;}
    if(this.event&&this.time-this.event.start>=this.event.duration){this.lastEvent=this.event.kind;this.event=null;}
    if(this.time>=this.nextEvent&&!this.event){
      const eligible=(phase==='listening'?['release','wrist','nod','shoulder']:phase==='thinking'?['release','wrist','shoulder','pinch']:phase==='speaking'?['palm','release','wrist']:['release','palm','wrist','shoulder','foot','pinch','stretch']).filter(k=>k!==this.lastEvent);
      const kind=eligible[Math.floor(this.random()*eligible.length)],duration=this.range(2.6,4.7);
      this.event={kind,start:this.time,duration,side:this.random()<.5?'left':'right',strength:this.range(.65,1)};
      this.nextEvent=this.time+duration+this.range(phase==='listening'?3:1.8,6.5);
    }
  }
  apply(pose,dt,{phase='idle',active=true}={}){
    if(!active){this.enabledAge=0;return pose;}
    this.tick(dt,phase);
    const blend=smooth(this.enabledAge/.7),p={...pose},add=(key,v)=>{p[key]=(p[key]??0)+v*blend;};
    // Asymmetric inhale, exhale and a brief rest, with varying cycle length.
    const cycle=this.breathAge/this.breathLength;
    const breath=cycle<.36?smooth(cycle/.36):cycle<.91?1-smooth((cycle-.36)/.55):0;
    add('chestX',-.008*breath);add('spineX',.004*breath);
    p.upperChestX=-.007*breath*blend;p.upperChestY=(p.chestY??0)*.12;p.upperChestZ=(p.chestZ??0)*.12;
    add('leftShoulderLift',.014*breath);add('rightShoulderLift',.011*breath);
    add('hipsSide',this.posture);add('hipsDrop',Math.abs(this.posture)*.45);
    add('hipsRoll',-this.posture*.65);add('chestZ',this.posture*.7);
    add('neckY',this.gaze.x*.0014);add('headY',this.gaze.x*.0038);
    add('neckX',this.gaze.y*.001);add('headX',this.gaze.y*.0025);
    // Eyes arrive first; the body controller gives head/neck longer response times.
    p.eyeYaw=this.gaze.x*blend;p.eyePitch=this.gaze.y*blend;p.naturalGaze=true;
    p.naturalBlink=this.blinkAge<.09?smooth(this.blinkAge/.09):1-smooth((this.blinkAge-.09)/.13);
    this.label=titles.quiet;
    const event=this.event;
    if(event){
      this.label=titles[event.kind];const age=this.time-event.start,w=envelope(age,event.duration)*event.strength,s=event.side;
      // Do not compete with an existing authored large arm gesture.
      const free=1-smooth(((p[s+'Lift']??0)-.18)/.38),hand=w*free;
      if(event.kind==='release'){
        const fingers=['Little','Ring','Middle','Index','Thumb'];
        fingers.forEach((f,i)=>{for(let j=0;j<3;j++)add(`${s}${f}${j}`,envelope(age-i*.065-j*.035,event.duration-.4)*(.18+j*.035)*free);});
        add(s+'ThumbOpposition',.13*hand);add(s+'Spread',-.04*hand);
      }
      if(event.kind==='palm'){add(s+'Lift',.14*hand);add(s+'Forward',.12*hand);add(s+'Elbow',.32*hand);add(s+'Palm',(s==='left'?-.24:.24)*hand);add(s+'Spread',.07*hand);add(s+'Wrist',.05*hand);}
      if(event.kind==='pinch'){
        add(s+'ThumbOpposition',.24*hand);add(s+'Thumb0',.15*hand);add(s+'Thumb1',.13*hand);
        add(s+'Index0',.24*hand);add(s+'Index1',.29*hand);add(s+'Index2',.16*hand);add(s+'Flex',.05*hand);
      }
      if(event.kind==='stretch'){
        add(s+'Spread',.13*hand);add(s+'Palm',.18*hand);add(s+'Elbow',.1*hand);
        for(const f of ['Index','Middle','Ring','Little'])for(let j=0;j<3;j++)add(`${s}${f}${j}`,-.15*hand);
      }
      if(event.kind==='wrist'){add(s+'Flex',.14*hand);add(s+'Palm',-.16*hand);add(s+'ThumbOpposition',.16*hand);add(s+'Elbow',.12*hand);add(s+'Little0',.11*hand);}
      if(event.kind==='shoulder'){add(s+'ShoulderLift',.07*w);add(s+'ShoulderForward',.07*w);add('neckZ',(s==='left'?-.02:.02)*w);add('chestY',(s==='left'?.02:-.02)*w);}
      if(event.kind==='nod'){add('headX',.045*w);add('neckX',.016*w);}
      if(event.kind==='foot'){
        // Shift onto the other leg before unloading a foot; settle it before returning.
        const support=envelope(age,event.duration);
        add('hipsSide',(s==='left'?.009:-.009)*support);
        const lift=envelope(age-.45,event.duration-.9)*event.strength;
        add(s+'Knee',.20*lift);add(s+'FootForward',.004*lift);add(s+'FootPitch',.05*lift);add(s+'Toes',.065*lift);
        add('chestZ',(s==='left'?.007:-.007)*support);
      }
    }
    return p;
  }
}

// Exact critically damped step for a constant target. Preserve velocity between
// targets so interrupted motion decelerates rather than restarting an ease curve.
export function followJoint(position,velocity,target,dt,omega){
  const offset=position-target,c=velocity+omega*offset,decay=Math.exp(-omega*dt);
  return {position:target+(offset+c*dt)*decay,velocity:(velocity-omega*c*dt)*decay};
}
export function responseRate(key){
  if(/^eye/.test(key))return 48;
  if(/(Thumb|Index|Middle|Ring|Little)/.test(key))return 14;
  if(/(Palm|Wrist|Flex|Spread)/.test(key))return 16;
  if(/^head/.test(key))return 22;
  if(/^neck/.test(key))return 19;
  if(/(hips|spine|chest)/.test(key))return 15;
  return 20;
}
