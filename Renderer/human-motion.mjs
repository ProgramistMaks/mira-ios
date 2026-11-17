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

// Retained compatibility entry point for restrained, audio-driven body accents.
// NaturalBehavior owns nonperiodic attention, respiration and secondary actions.
export function humanizePose(pose, time, intensity, phase, emphasis, automaticGaze) {
  const result={...pose}, amount=unit(intensity);
  // Automatic respiration/postural motion is owned by NaturalBehavior. Keep
  // this layer limited to actual speech accents to avoid stacking idle loops.
  if(phase==='speaking') {
    result.headX+=emphasis.beat*.022*amount;
    result.chestX+=emphasis.beat*.004*amount;
  }
  return boundedPose(result);
}
