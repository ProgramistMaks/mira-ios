// Uneven blink intervals keep the face alive without tying it to a body loop.
const intervals = [3.8, 5.2, 4.4, 6.1, 3.2, 5.7];
export function motion(time, phase, reduced, audioLevel = 0) {
  let t = Math.max(0, time) % intervals.reduce((a, b) => a + b, 0);
  let interval = intervals[0];
  for (const value of intervals) { interval = value; if (t < value) break; t -= value; }
  const blinkAge = t - interval + 0.18;
  return {
    blink: blinkAge > 0 ? Math.sin(blinkAge / 0.18 * Math.PI) : 0,
    // Only audible PCM drives the mouth. No speaking animation without audio.
    mouth: phase === 'speaking' && Number.isFinite(audioLevel) ? Math.max(0, Math.min(1, audioLevel)) : 0,
  };
}

// Close the mouth if the native audio bridge stalls, even with a stale speaking phase.
export function speechLevel(level, ageSeconds) {
  if (!Number.isFinite(level) || !Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 0.18) return 0;
  return Math.max(0, Math.min(1, level));
}

// Timestamp at audio sampling, not at JavaScript delivery: a blocked WebView must
// not give a queued mouth pose a new 180 ms lifetime. Only numbers cross the bridge.
export class SpeechSamples {
  amplitude = 0; sampledAt = -Infinity; sequence = -1; active = true; notBefore = -Infinity;
  reset(wallNow = Date.now()) {
    this.amplitude = 0; this.sampledAt = -Infinity; this.notBefore = wallNow;
  }
  setActive(value, wallNow = Date.now()) {
    const active = value === true;
    if (active !== this.active) this.reset(wallNow);
    this.active = active;
  }
  receive(level, capturedAt, sequence, wallNow = Date.now(), monotonicNow = performance.now()) {
    if (!Number.isSafeInteger(sequence) || sequence <= this.sequence) return false;
    this.sequence = sequence;
    const age = wallNow - capturedAt;
    if (!this.active || !Number.isFinite(capturedAt) || !Number.isFinite(wallNow) || !Number.isFinite(monotonicNow)
        || capturedAt < this.notBefore || age < 0 || age > 180) {
      this.amplitude = 0; this.sampledAt = -Infinity; return false;
    }
    this.amplitude = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    this.sampledAt = monotonicNow - age;
    return true;
  }
  level(monotonicNow = performance.now()) {
    return this.active ? speechLevel(this.amplitude, (monotonicNow - this.sampledAt) / 1000) : 0;
  }
}
