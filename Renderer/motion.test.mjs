import test from 'node:test';
import assert from 'node:assert/strict';
import { motion } from './motion.mjs';

test('silent phases never move the mouth', () => {
  for (const phase of ['idle', 'thinking', 'listening']) {
    for (let t = 0; t < 20; t += 0.03) assert.equal(motion(t, phase, false).mouth, 0);
  }
});
test('reduced motion removes body motion while keeping speech feedback', () => {
  const pose = motion(1, 'speaking', true);
  assert.equal(pose.head, 0); assert.equal(pose.breathe, 0); assert.ok(pose.mouth > 0);
});
test('expression weights stay finite and within valid bounds', () => {
  for (let t = 0; t < 120; t += 0.013) {
    const pose = motion(t, 'speaking', false);
    for (const key of ['blink', 'mouth', 'smile']) assert.ok(pose[key] >= 0 && pose[key] <= 1);
  }
});
