const {test} = require('node:test');
const assert = require('node:assert/strict');

test('tempo comes from beat timing, tolerates small jitter and missing beats, and rejects irregular input', async () => {
  const {estimateTempo} = await import('../ui/music-tempo.mjs');
  for (const bpm of [75, 109, 145, 177]) {
    const times = Array.from({length:18},(_,i)=>i*60/bpm + .012*Math.sin(i*1.9));
    times.splice(5,1);
    times.splice(10,1);
    assert.ok(Math.abs(estimateTempo(times)-bpm)<=2,bpm);
  }
  assert.equal(estimateTempo([0, .55, 1.1]), 0);
  assert.equal(estimateTempo([0, .29, 1.35, 2.05, 2.42, 3.32, 3.95]), 0);
});
