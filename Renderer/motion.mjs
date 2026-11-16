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
