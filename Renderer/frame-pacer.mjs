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
    if (timestamp + Math.min(0.2, interval * 0.02) < this.next) return false;
    this.next += Math.max(1, Math.floor((timestamp - this.next) / interval) + 1) * interval;
    return true;
  }
}
