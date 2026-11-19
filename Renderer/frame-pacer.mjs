// Follow display callbacks; never synthesize extra frames with timers. Keep the
// deadline's fractional remainder so 120/240 Hz callbacks don't drift to half rate.
export class FramePacer {
  rate = 0; next = 0; previous = -Infinity;
  shouldRender(timestamp, rate) {
    if (!Number.isFinite(timestamp) || !Number.isInteger(rate) || rate < 1 || rate > 240) return false;
    const interval = 1000 / rate;
    if (rate !== this.rate || timestamp < this.previous) {
      this.rate = rate; this.next = timestamp;
    }
    this.previous = timestamp;
    // Display timestamps can be rounded to whole milliseconds. Assign each
    // callback to its nearest due slot within this small early window.
    const tolerance = Math.min(1.6, interval * .18);
    if (timestamp + tolerance < this.next) return false;
    this.next += Math.max(1, Math.floor((timestamp + tolerance - this.next) / interval) + 1) * interval;
    return true;
  }
}

// Count completed WebGL submissions against wall time, independently of the
// requested cap or the clock used to advance the animation.
export class RenderCadence {
  first = undefined;
  previous = undefined;
  gaps = [];
  reset() {
    this.first = this.previous = undefined;
    this.gaps.length = 0;
  }
  sample(now) {
    if (this.previous === undefined || now < this.previous) {
      this.reset();
      this.first = this.previous = now;
      return;
    }
    this.gaps.push(now - this.previous);
    this.previous = now;
    const elapsed = now - this.first;
    if (elapsed < 2000) return;
    const fps = Math.round(this.gaps.length * 1000 / elapsed);
    this.gaps.sort((a,b)=>a-b);
    const p95ms = Math.round(this.gaps[Math.ceil(this.gaps.length*.95)-1]*10)/10;
    this.gaps.length = 0;
    this.first = now;
    return {fps, p95ms};
  }
}
