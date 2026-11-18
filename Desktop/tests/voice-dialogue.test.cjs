const test = require('node:test');
const assert = require('node:assert/strict');

test('wake follow-ups expire in standby only and allow a command after a bare name', async () => {
  const { followUpDelay } = await import('../ui/wake.mjs');
  assert.equal(followUpDelay(false, false, false, 3), null);
  assert.equal(followUpDelay(true, true, false, 3), null);
  assert.equal(followUpDelay(true, false, true, 0), 8000);
  assert.equal(followUpDelay(true, false, false, 0), 0);
  assert.equal(followUpDelay(true, false, false, 6), 6000);
});

test('delayed loudspeaker echo does not interrupt playback, but independent speech interrupts and keeps its first syllable', async () => {
  const { Voice } = await import('../ui/audio.js');
  const { outputReference } = await import('../ui/voice-signal.mjs');
  const rate = 48000,
    frame = 2048,
    start = 2,
    lag = 0.09;
  const signal = (seed, length) => {
    const samples = new Float32Array(length);
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      samples[i] = 0.18 * (seed / 2147483648 - 1);
    }
    return samples;
  };
  const output = signal(42, rate * 3),
    other = signal(99, frame * 8),
    states = [];
  const voice = new Voice(
    () => {},
    (s) => states.push(s),
    (e) => {
      throw e;
    },
  );
  Object.assign(voice, {
    enabled: true,
    ctx: { sampleRate: rate, currentTime: start },
    settings: { silence: 0.45 },
    speaker: {},
    playing: true,
    busy: true,
    reference: outputReference(output, rate, 1, start),
    overlap: [],
    overlapTime: 0,
    overlapQuiet: 0,
  });
  voice.reset();
  voice.hush = () => {
    voice.playing = false;
    voice.speaker = null;
  };
  let captured;
  voice.turn = async (bytes) => {
    captured = bytes;
  };
  for (let i = 0; i < 10; i++) {
    const offset = i * frame;
    voice.chunk(
      output.slice(offset, offset + frame).map((x) => -x * 0.7),
      start + lag + offset / rate,
    );
  }
  assert.equal(voice.playing, true);
  assert.deepEqual(states, []);
  for (let offset = 0; offset < other.length; offset += frame)
    voice.chunk(other.slice(offset, offset + frame), start + lag + (10 * frame + offset) / rate);
  assert.equal(voice.playing, false);
  assert.deepEqual(states, ['Слышу тебя…']);
  assert.equal(voice.frames[0][0], other[0]);
  for (let i = 0; i < 12; i++) voice.chunk(new Float32Array(frame), start + 1 + (i * frame) / rate);
  assert.equal(Buffer.from(captured).subarray(0, 4).toString(), 'RIFF');
  assert.ok(captured.length > 44);
});
