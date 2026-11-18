import assert from 'node:assert/strict';
export function microphoneWav(raw) {
  let rate, channels, pcm;
  for (let off = 12; off + 8 <= raw.length; ) {
    const size = raw.readUInt32LE(off + 4),
      kind = raw.toString('ascii', off, off + 4);
    if (kind === 'fmt ') {
      assert.equal(raw.readUInt16LE(off + 8), 1);
      channels = raw.readUInt16LE(off + 10);
      rate = raw.readUInt32LE(off + 12);
      assert.equal(raw.readUInt16LE(off + 22), 16);
    }
    if (kind === 'data') pcm = raw.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  assert.ok(pcm && channels && rate);
  const sampleRate = 48000,
    speechSamples = Math.floor(((pcm.length / (2 * channels)) * sampleRate) / rate);
  const count = sampleRate * 10 + speechSamples,
    b = Buffer.alloc(44 + 2 * count);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(2 * sampleRate, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = 0; i < speechSamples; i++)
    b.writeInt16LE(
      pcm.readInt16LE(2 * channels * Math.floor((i * rate) / sampleRate)),
      44 + 2 * (i + 2 * sampleRate),
    );
  return b;
}
