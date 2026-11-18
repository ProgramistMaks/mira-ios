import { FramePacer } from './frame-pacer.mjs';

// Pause authored motion and physics together. A resumed display callback establishes
// a new time origin instead of applying time spent behind a sheet/in the background.
export class AnimationTimeline {
  active = true; playbackDelta = 0; previous = undefined; pacer = new FramePacer();
  resetClock() {
    this.previous = undefined;
    this.playbackDelta = 0;
    this.pacer = new FramePacer();
  }
  setActive(value) {
    const active = value === true;
    if (active !== this.active) {
      this.resetClock();
    }
    this.active = active;
  }
  advance(timestamp, rate) {
    if (!this.active || !this.pacer.shouldRender(timestamp, rate)) return null;
    const elapsed = this.previous === undefined ? 0 : Math.max(0, (timestamp - this.previous) / 1000);
    const delta = Math.min(elapsed, 0.05);
    // Authored poses can be sampled directly. Physics still takes a bounded step.
    this.playbackDelta = elapsed <= 1.5 ? elapsed : delta;
    this.previous = timestamp;
    return delta;
  }
}
