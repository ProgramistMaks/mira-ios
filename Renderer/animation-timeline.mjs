import { FramePacer } from './frame-pacer.mjs';

// Pause authored motion and physics together. A resumed display callback establishes
// a new time origin instead of applying time spent behind a sheet/in the background.
export class AnimationTimeline {
  active = true; previous = undefined; pacer = new FramePacer();
  setActive(value) {
    const active = value === true;
    if (active !== this.active) {
      this.previous = undefined;
      this.pacer = new FramePacer();
    }
    this.active = active;
  }
  advance(timestamp, rate) {
    if (!this.active || !this.pacer.shouldRender(timestamp, rate)) return null;
    const delta = this.previous === undefined ? 0 : Math.max(0, Math.min((timestamp - this.previous) / 1000, 0.05));
    this.previous = timestamp;
    return delta;
  }
}
