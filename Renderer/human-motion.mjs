import { boundedPose } from './expression-library.mjs';

const unit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

// Audio only affects restrained body emphasis. It never generates mouth motion.
export class SpeechEmphasis {
  constructor() { this.reset(); }
  reset() { this.energy=0;this.pulseAge=Infinity;this.sinceBeat=1;this.armed=true; }
  update(delta, level, speaking) {
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(delta,.05)):0;
    if(!speaking){this.reset();return {energy:0,beat:0};}
    const amplitude=unit(level);
    this.energy+=(unit(amplitude*2.2)-this.energy)*(1-Math.exp(-dt*3));
    this.sinceBeat+=dt;this.pulseAge+=dt;
    if(amplitude<.06)this.armed=true;
    if(dt>0&&this.armed&&amplitude>.18&&this.sinceBeat>=.8){
      this.pulseAge=0;this.sinceBeat=0;this.armed=false;
    }
    const beat=this.pulseAge<.7?Math.sin(Math.PI*this.pulseAge/.7)**2:0;
    return {energy:this.energy,beat};
  }
}

// Low-amplitude, continuous secondary motion, sampled in scene time rather than
// random joint noise each frame. Hidden time is excluded by the host timeline.
export function humanizePose(pose, time, intensity, phase, emphasis, automaticGaze) {
  const result={...pose}, amount=unit(intensity);
  const breath=(1-Math.cos(time*1.12+.12*Math.sin(time*.23)))*.5;
  result.chestX-=breath*.007*amount;
  result.spineX+=breath*.003*amount;
  result.leftLift+=breath*.006*amount;
  result.rightLift+=breath*.0045*amount;
  result.leftWrist+=Math.sin(time*.71)*.006*amount;
  result.rightWrist+=Math.sin(time*.63+.8)*.005*amount;
  if(phase==='speaking') {
    result.headX+=emphasis.beat*.022*amount;
    result.chestX+=emphasis.beat*.004*amount;
  }
  if(automaticGaze) {
    // Brief glances return towards the partner; manual gaze selections are kept.
    const glance=((1-Math.cos(time*.73))*.5)**3;
    const attention=phase==='listening'?.12+.35*glance:.25+.75*glance;
    result.gazeX*=attention;result.gazeY*=attention;
  }
  return boundedPose(result);
}
