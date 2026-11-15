export function motion(time, phase, reduced) {
  const speaking = phase === 'speaking';
  const listening = phase === 'listening';
  const blinkCycle = time % 4.7;
  return {
    breathe: reduced ? 0 : Math.sin(time * 1.65) * 0.008,
    head: reduced ? 0 : Math.sin(time * 0.6) * 0.045 + (listening ? 0.09 : 0),
    blink: blinkCycle < 0.18 ? Math.sin(blinkCycle / 0.18 * Math.PI) : 0,
    // Temporary speech envelope, NOT phoneme lip sync. Quality gate requires replacement.
    mouth: speaking ? Math.max(0, Math.sin(time * 13) * 0.45 + 0.22) : 0,
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
