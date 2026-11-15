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
  };
}
