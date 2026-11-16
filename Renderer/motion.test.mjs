import test from 'node:test';
import assert from 'node:assert/strict';
import { motion, greetingEnvelope, speechLevel } from './motion.mjs';

test('silent phases never move the mouth', () => {
  for (const phase of ['idle', 'thinking', 'listening']) {
    for (let t = 0; t < 20; t += 0.03) assert.equal(motion(t, phase, false).mouth, 0);
  }
});
test('reduced motion removes body motion while keeping speech feedback', () => {
  const pose = motion(1, 'speaking', true, 0.5);
  assert.equal(pose.head, 0); assert.equal(pose.breathe, 0); assert.ok(pose.mouth > 0);
});
test('expression weights stay finite and within valid bounds', () => {
  for (let t = 0; t < 120; t += 0.013) {
    const pose = motion(t, 'speaking', false);
    for (const key of ['blink', 'mouth', 'smile']) assert.ok(pose[key] >= 0 && pose[key] <= 1);
  }
});
test('greeting eases into and out of the resting pose and obeys reduced motion', () => {
  assert.equal(greetingEnvelope(0, false), 0);
  assert.equal(greetingEnvelope(0.7, false), 1);
  assert.equal(greetingEnvelope(2.8, false), 0);
  assert.equal(greetingEnvelope(1, true), 0);
  assert.ok(greetingEnvelope(0.001, false) < 0.00001);
  assert.ok(greetingEnvelope(2.799, false) < 0.00001);
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
