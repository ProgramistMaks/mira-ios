export function motion(time, phase, reduced, audioLevel = 0) {
  const speaking = phase === 'speaking';
  const listening = phase === 'listening';
  const blinkCycle = time % 4.7;
  return {
    breathe: reduced ? 0 : Math.sin(time * 1.65) * 0.008,
    head: reduced ? 0 : Math.sin(time * 0.6) * 0.045 + (listening ? 0.09 : 0),
    blink: blinkCycle < 0.18 ? Math.sin(blinkCycle / 0.18 * Math.PI) : 0,
    // Only audible PCM drives the mouth. No speaking animation without audio.
    mouth: speaking && Number.isFinite(audioLevel) ? Math.max(0, Math.min(1, audioLevel)) : 0,
    smile: speaking ? 0.18 : 0.08,
    handSway: reduced ? 0 : Math.sin(time * (speaking ? 2.1 : 0.8)) * (speaking ? 0.07 : 0.015),
  };
}

export function greetingEnvelope(age, reduced) {
  if (reduced || age < 0 || age >= 2.8) return 0;
  const ease = x => x * x * (3 - 2 * x);
  if (age < 0.7) return ease(age / 0.7);
  if (age < 1.9) return 1;
  return 1 - ease((age - 1.9) / 0.9);
}

// Close the mouth if the native audio bridge stalls, even with a stale speaking phase.
export function speechLevel(level, ageSeconds) {
  if (!Number.isFinite(level) || !Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 0.18) return 0;
  return Math.max(0, Math.min(1, level));
}
