// Score observed intervals against a candidate pulse, allowing occasional missed beats.
export function estimateTempo(times) {
  const intervals = times.slice(1).map((time,i)=>time-times[i]).filter(gap=>gap >= .23 && gap < 2.05);
  if (intervals.length < 4) return 0;
  let best = 0, candidate = 0;
  for (let bpm=55;bpm<=195;bpm++) {
    const period = 60/bpm;
    let score = 0;
    for (const gap of intervals) {
      const steps = Math.round(gap/period);
      if (steps < 1 || steps > 3) continue;
      const relativeError = Math.abs(gap/steps-period)/period;
      score += Math.max(0,1-relativeError*7) / Math.sqrt(steps);
    }
    if (score > best) {
      best = score;
      candidate = bpm;
    }
  }
  return best/intervals.length >= .61 ? candidate : 0;
}

export class MusicTempo {
  constructor(media, publish) {
    this.media = media;
    this.publish = publish;
    this.times = [];
    this.bpm = 0;
    this.onset = -Infinity;
    this.mean = 0;
    this.previousTime = -Infinity;
  }

  async start() {
    if (this.timer) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = .05;
      const source = this.context.createMediaElementSource(this.media);
      source.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.spectrum = new Float32Array(this.analyser.frequencyBinCount);
      this.bins = Math.min(this.spectrum.length,Math.ceil(2500*this.analyser.fftSize/this.context.sampleRate));
      this.previous = new Float32Array(this.bins);
    }
    await this.context.resume();
    if (!this.timer && !this.media.paused && !this.media.seeking)
      this.timer = setInterval(()=>this.sample(),1000/45);
  }

  reset() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.times.length = 0;
    this.previous?.fill(0);
    this.onset = this.previousTime = -Infinity;
    this.mean = 0;
    this.setTempo(0);
  }

  setTempo(bpm) {
    if (this.bpm === bpm || (bpm && Math.abs(this.bpm-bpm)<3)) return;
    this.bpm = bpm;
    this.publish(bpm);
  }

  sample() {
    const time = this.media.currentTime;
    if (time === this.previousTime) return;
    const first = !Number.isFinite(this.previousTime);
    this.previousTime = time;
    this.analyser.getFloatFrequencyData(this.spectrum);
    let flux = 0;
    for (let i=1;i<this.bins;i++) {
      const energy = 10**(this.spectrum[i]*.05);
      flux += Math.max(0,energy-this.previous[i])*(i<10 ? 3 : 1);
      this.previous[i] = energy;
    }
    flux /= this.bins;
    const threshold = Math.max(.0012,this.mean*2.4);
    this.mean = this.mean*.93 + flux*.07;
    if (!first && flux > threshold && time-this.onset > .265) {
      this.onset = time;
      this.times.push(time);
      while (this.times.length && time-this.times[0] > 10) this.times.shift();
      const tempo = estimateTempo(this.times);
      if (tempo) this.setTempo(tempo*this.media.playbackRate);
    } else if (time-this.onset > 2.3) {
      this.times.length = 0;
      this.setTempo(0);
    }
  }
}
