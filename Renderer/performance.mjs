import { ActingController, REST } from './acting.mjs';
import { GESTURES, EMOTIONS, GAZES, STANCES, FACE_REST, decodeVariant, encodeVariant, sampleVariant, mixPerformance } from './expression-library.mjs';
import { SpeechEmphasis, humanizePose } from './human-motion.mjs';

// Emotional style is contextual or explicitly selected, never a claim to read feelings.
const automaticEmotions={
  idle:['neutral','warm','calm','curious','shy'],
  listening:['warm','calm','curious','empathetic'],
  thinking:['neutral','curious','thoughtful'],
  speaking:['warm','joy','calm','confident'],
};
export class PerformanceController {
  constructor(seed=0x6d697261) {
    this.base=new ActingController();this.seed=(seed>>>0)||1;
    this.pose={...REST,...FACE_REST};this.from={...this.pose};
    this.settings={emotion:'auto',intensity:.7,variant:-1,enabled:true};
    this.variant=0;this.age=0;this.fadeAge=1;this.fadeDuration=.65;
    this.reduced=false;this.history=[];this.gestureHistory=[];
    this.time=0;this.emphasis=new SpeechEmphasis();this.autoEmotion=null;this.moodTurns=0;
    this.directReaction=false;
    this.choose();
  }
  get clip(){return this.base.clip;}
  get phase(){return this.base.phase;}
  random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
  configure(settings={}) {
    if(!settings || typeof settings!=='object')settings={};
    const next={
      emotion:settings.emotion==='auto'||EMOTIONS.some(e=>e.id===settings.emotion)?settings.emotion:'auto',
      intensity:Number.isFinite(settings.intensity)?Math.max(.35,Math.min(1,settings.intensity)):.7,
      variant:decodeVariant(settings.variant)?settings.variant:-1,
      enabled:settings.enabled!==false,
    };
    if(Object.keys(next).every(k=>next[k]===this.settings[k]))return;
    this.settings=next;this.choose();
  }
  choose(touch=false) {
    this.from={...this.pose};this.fadeAge=0;this.age=0;
    if(this.settings.variant>=0)this.variant=this.settings.variant;
    else {
      const eligible=GESTURES.map((g,i)=>({g,i})).filter(({g})=>g.phases.includes(this.phase)).map(({i})=>i);
      const fresh=eligible.filter(i=>!this.gestureHistory.includes(i));
      const gestures=fresh.length?fresh:eligible;
      const allowed=touch?['warm','joy','curious']:automaticEmotions[this.phase];
      // Hold an emotional style across several gestures instead of changing face
      // every time a new hand movement is selected.
      if(!allowed.includes(this.autoEmotion)||this.moodTurns<=0){
        this.autoEmotion=allowed[Math.floor(this.random()*allowed.length)];this.moodTurns=3;
      }
      this.moodTurns--;
      const emotionID=this.settings.emotion==='auto'?this.autoEmotion:this.settings.emotion;
      const emotions=EMOTIONS.map((e,i)=>({e,i})).filter(({e})=>e.id===emotionID).map(({i})=>i);
      const count=gestures.length*emotions.length*GAZES.length*STANCES.length;
      let rank=Math.floor(this.random()*count), candidate;
      // At most 65 probes with a 64-item recent window; no unbounded retry/allocation.
      for(let attempt=0;attempt<=this.history.length;attempt++,rank=(rank+1)%count){
        let index=rank;const stance=index%STANCES.length;index=Math.floor(index/STANCES.length);
        const gaze=index%GAZES.length;index=Math.floor(index/GAZES.length);
        const emotion=emotions[index%emotions.length];const gesture=gestures[Math.floor(index/emotions.length)];
        candidate=encodeVariant(gesture,emotion,gaze,stance);
        if(!this.history.includes(candidate))break;
      }
      this.variant=candidate;this.history.push(candidate);if(this.history.length>64)this.history.shift();
      this.gestureHistory.push(decodeVariant(candidate).gesture);
      if(this.gestureHistory.length>4)this.gestureHistory.shift();
    }
    const selected=decodeVariant(this.variant);
    // A little timing variation per phrase, never a random speed change mid-gesture.
    this.duration=GESTURES[selected.gesture].duration*(this.settings.variant>=0?1:.92+this.random()*.16);
    const pause=this.phase==='listening'?5:this.phase==='idle'?4:2.5;
    this.nextAt=this.duration+pause+this.random()*4;
  }
  setPhase(phase) {
    if(!automaticEmotions[phase]||phase===this.phase)return;
    this.base.setPhase(phase);this.moodTurns=0;this.choose();
  }
  trigger(kind) {
    if(!this.base.trigger(kind))return false;
    if(kind==='touch')this.choose(true);
    return true;
  }
  update(delta,reduced=false,speechLevel=0) {
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(delta,.05)):0;
    const base=this.base.update(dt,reduced);
    if(this.reduced!==reduced){this.reduced=reduced;this.from={...this.pose};this.fadeAge=0;}
    this.age+=dt;this.fadeAge+=dt;this.time+=dt;
    const emphasis=this.emphasis.update(dt,speechLevel,this.phase==='speaking'&&!reduced&&this.settings.enabled);
    if(!reduced&&this.settings.enabled&&this.age>=this.nextAt)this.choose();
    // Greeting and direct touch keep their authored silhouette; overlays don't fight them.
    const directReaction=['greeting','touch'].includes(this.clip);
    if(directReaction!==this.directReaction){
      this.directReaction=directReaction;this.from={...this.pose};this.fadeAge=0;
      // A suppressed gesture must begin at preparation when the one-shot ends,
      // never jump straight into the middle of its arm stroke.
      if(!directReaction)this.age=0;
    }
    // During speech pauses the arms settle instead of delivering silent emphatic gestures.
    const activity=this.phase==='speaking'?.25+.75*emphasis.energy:1;
    const conversationalBase={...base};
    // Automatic idle/listening no longer repeat the full short base sway/nod loop.
    // Keep authored one-shots and manually selected demonstrations intact.
    if(this.settings.enabled&&this.settings.variant<0&&!directReaction){
      for(const key of Object.keys(REST))if(key!=='smile')conversationalBase[key]=REST[key]+(base[key]-REST[key])*.22;
    }
    if(this.settings.enabled&&this.phase==='speaking')for(const key of Object.keys(REST)) {
      if(/^(left|right)/.test(key))conversationalBase[key]=REST[key]+(conversationalBase[key]-REST[key])*activity;
    }
    const gestureWeight=directReaction?0:activity;
    let target=this.settings.enabled?sampleVariant(this.variant,Math.min(1,this.age/this.duration),conversationalBase,this.settings.intensity,gestureWeight):{...base,...FACE_REST};
    if(this.settings.enabled&&!reduced&&!directReaction)
      target=humanizePose(target,this.time,this.settings.intensity,this.phase,emphasis,this.settings.variant<0);
    if(reduced)target={...REST,smile:target.smile,angry:target.angry,sad:target.sad,relaxed:target.relaxed,surprise:target.surprise};
    this.pose=mixPerformance(this.from,target,Math.min(1,this.fadeAge/this.fadeDuration));
    return this.pose;
  }
}
