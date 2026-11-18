// Match the actual output waveform across acoustic delay. Work on a small mono reference
// so correlation runs only while the companion speaks and a voiced input is present.
const rate = 6000;
function resample(samples, sampleRate) {
  const step = sampleRate / rate,
    result = new Float32Array(Math.floor(samples.length / step));
  for (let i = 0; i < result.length; i++) {
    const from = Math.floor(i * step),
      end = Math.min(samples.length, Math.max(from + 1, Math.floor((i + 1) * step)));
    let sum = 0;
    for (let j = from; j < end; j++) sum += samples[j];
    result[i] = sum / (end - from);
  }
  return result;
}
export function outputReference(samples, sampleRate, playbackRate, start) {
  return { samples: resample(samples, sampleRate * playbackRate), start };
}
export function isPlaybackEcho(input, sampleRate, time, output) {
  if (!output || !Number.isFinite(time)) return false;
  const window = resample(input, sampleRate),
    ref = output.samples;
  const length = window.length;
  if (length < 32) return false;
  // 48 widely spaced samples preserve shape and tolerate opposite microphone polarity.
  const stride = Math.max(1, Math.floor(length / 48));
  let energy = 0;
  for (let j = 0; j < length; j += stride) energy += window[j] * window[j];
  if (energy < 1e-7) return false;
  const position = Math.round((time - output.start) * rate);
  const min = Math.max(0, position - Math.round(rate * 0.4)),
    max = Math.min(ref.length - length, position + Math.round(rate * 0.025));
  for (let i = min; i <= max; i++) {
    let dot = 0,
      power = 0;
    for (let j = 0; j < length; j += stride) {
      const v = ref[i + j];
      power += v * v;
      dot += v * window[j];
    }
    if (power > 1e-7 && dot * dot > 0.64 * energy * power) return true;
  }
  return false;
}
