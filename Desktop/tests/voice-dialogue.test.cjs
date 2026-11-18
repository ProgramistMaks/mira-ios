const test = require('node:test');
const assert = require('node:assert/strict');

test('every hands-free turn needs its own wake word. A separate name accepts exactly one question', async () => {
  const { WakeGate } = await import('../ui/wake.mjs');
  const gate = new WakeGate();
  assert.equal(gate.accept('открой браузер', 'Вита', 100, 100), undefined);
  assert.equal(gate.accept('Мира, открой браузер', 'Вита', 200, 200), 'открой браузер');
  assert.equal(gate.accept('запиши заметку', 'Вита', 300, 300), undefined);
  assert.equal(gate.accept('привет, Мира!', 'Вита', 400, 400), undefined);
  assert.ok(gate.pending(450));
  assert.equal(gate.accept('какая погода', 'Вита', 10399, 18000), 'какая погода');
  assert.ok(!gate.pending(18001));
  gate.accept('Мира', 'Вита', 20000, 20000);
  assert.equal(gate.accept('привет', 'Вита', 30001, 30001), undefined);
  assert.equal(gate.accept('мы говорили про Миру', 'Вита', 31000, 31000), undefined);
  assert.equal(gate.accept('Mira, hello', 'Вита', 32000, 32000), 'hello');
  assert.equal(gate.accept('Вита, привет', 'Вита', 33000, 33000), 'привет');
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
