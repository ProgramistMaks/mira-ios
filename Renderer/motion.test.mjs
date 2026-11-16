import test from 'node:test';
import assert from 'node:assert/strict';
import { motion, speechLevel } from './motion.mjs';

test('silent phases never move the mouth', () => {
  for (const phase of ['idle', 'thinking', 'listening']) {
    for (let t = 0; t < 20; t += 0.03) assert.equal(motion(t, phase, false).mouth, 0);
  }
});
test('speech feedback stays available with reduced motion', () => {
  const pose = motion(1, 'speaking', true, 0.5);
  assert.ok(pose.mouth > 0);
});
test('expression weights stay finite and within valid bounds', () => {
  for (let t = 0; t < 120; t += 0.013) {
    const pose = motion(t, 'speaking', false);
    for (const key of ['blink', 'mouth']) assert.ok(pose[key] >= 0 && pose[key] <= 1);
  }
});
test('mouth follows audio, stays closed during silence and ignores stale samples', () => {
  assert.equal(motion(1, 'speaking', false).mouth, 0);
  assert.equal(motion(1, 'speaking', false, 0.7).mouth, 0.7);
  assert.equal(motion(2, 'idle', false, 0.7).mouth, 0);
  assert.equal(motion(2, 'speaking', false, NaN).mouth, 0);
  assert.equal(speechLevel(0.7, 0.05), 0.7);
  for (const age of [0.2, -1, Infinity, NaN]) assert.equal(speechLevel(0.7, age), 0);
  assert.equal(speechLevel(Infinity, 0), 0);
});
