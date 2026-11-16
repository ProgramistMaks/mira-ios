import test from 'node:test';
import assert from 'node:assert/strict';
import { ActingController, CLIPS, REST, sampleClip } from './acting.mjs';
const distance = (a, b) => Math.max(...Object.keys(REST).map(key => Math.abs(a[key] - b[key])));
const advance = (actor, seconds, reduced = false) => { for (let t = 0; t < seconds; t += 1 / 60) actor.update(1 / 60, reduced); };

test('authored loops join without a pose discontinuity; gestures return to rest', () => {
  for (const [name, clip] of Object.entries(CLIPS)) {
    assert.ok(distance(sampleClip(name, 0), sampleClip(name, clip.duration - 0.00001)) < 0.00001, name);
    if (!clip.loop) assert.equal(distance(sampleClip(name, clip.duration), REST), 0);
    for (let t = 0; t < clip.duration; t += 0.013) {
      const pose = sampleClip(name, t);
      assert.ok(Object.values(pose).every(Number.isFinite), name);
      assert.ok(pose.smile >= 0 && pose.smile <= 1);
      assert.ok(pose.leftElbow <= 2.65 && pose.rightElbow <= 2.65);
    }
  }
});
test('rapid state changes and gesture interruption blend from the displayed pose', () => {
  const actor = new ActingController(); actor.trigger('greeting'); advance(actor, 1);
  for (const state of ['listening', 'thinking', 'speaking', 'idle']) {
    const before = actor.pose; actor.setPhase(state);
    assert.ok(distance(before, actor.update(0)) < 1e-10);
    advance(actor, 0.12);
  }
  advance(actor, 0.5);
  assert.equal(actor.clip, 'idle');
});
test('idle updates do not restart greeting; touch is distinct, debounced, and lower priority than listening', () => {
  const actor = new ActingController(); assert.equal(actor.trigger('greeting'), true);
  advance(actor, 0.5); actor.setPhase('idle'); assert.equal(actor.clip, 'greeting');
  assert.equal(actor.trigger('touch'), false);
  advance(actor, 3); assert.equal(actor.clip, 'idle');
  assert.equal(actor.trigger('touch'), true); assert.equal(actor.trigger('touch'), false);
  advance(actor, 0.5); actor.setPhase('listening'); assert.equal(actor.clip, 'listening');
  assert.equal(actor.trigger('touch'), false);
});
test('reduced motion settles into a quiet pose and rejects decorative gestures', () => {
  const actor = new ActingController(); actor.setPhase('thinking'); advance(actor, 2);
  advance(actor, 0.5, true);
  for (const key of Object.keys(REST).filter(key => key !== 'smile')) assert.equal(actor.pose[key], REST[key], key);
  assert.equal(actor.trigger('touch'), false);
  const pose = actor.pose; advance(actor, 5, true); assert.deepEqual(actor.pose, pose);
});

test('30/60/120/240 fps reach the same authored pose; invalid or stalled clocks cannot leap ahead', () => {
  const low = new ActingController(), high = new ActingController();
  low.setPhase('speaking'); high.setPhase('speaking');
  for (let i = 0; i < 90; i++) low.update(1 / 30);
  for (let i = 0; i < 180; i++) high.update(1 / 60);
  assert.ok(distance(low.pose, high.pose) < 1e-9);
  for (const rate of [120, 240]) {
    const actor = new ActingController(); actor.setPhase('speaking');
    for (let i = 0; i < rate * 3; i++) actor.update(1 / rate);
    assert.ok(distance(low.pose, actor.pose) < 1e-9);
  }
  const time = low.time;
  for (const value of [NaN, Infinity, -1]) low.update(value);
  assert.equal(low.time, time);
  low.update(60); assert.ok(low.time - time <= 0.050001);
});
