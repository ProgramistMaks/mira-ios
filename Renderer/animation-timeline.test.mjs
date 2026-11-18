import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationTimeline } from './animation-timeline.mjs';
import { ActingController, REST } from './acting.mjs';

test('resume preserves the displayed pose even if no display callbacks ran while hidden', () => {
  const timeline = new AnimationTimeline(), actor = new ActingController();
  actor.trigger('greeting');
  for (let i = 0; i < 100; i++) actor.update(timeline.advance(i * 1000 / 120, 120));
  const pose = { ...actor.pose };
  timeline.setActive(false); timeline.setActive(true);
  const delta = timeline.advance(100000, 120);
  assert.equal(delta, 0);
  actor.update(delta);
  for (const key of Object.keys(REST)) assert.equal(actor.pose[key], pose[key]);
  assert.ok(Math.abs(timeline.advance(100000 + 1000 / 120, 120) - 1 / 120) < 1e-10);
});

test('hidden callbacks and repeated active state updates do not advance or restart the clock', () => {
  const timeline = new AnimationTimeline();
  assert.equal(timeline.advance(0, 60), 0);
  timeline.setActive(true);
  assert.equal(timeline.advance(20, 60), 0.02);
  timeline.setActive(false);
  for (let i = 0; i < 100; i++) assert.equal(timeline.advance(30 + i * 10, 60), null);
  timeline.setActive(false); timeline.setActive(true);
  assert.equal(timeline.advance(2000, 60), 0);
});

test('skipped callbacks retain elapsed motion time and changing rates does not change speed', () => {
  for (const rate of [30, 60, 120, 240]) {
    const timeline = new AnimationTimeline();
    let time = 0;
    for (let i = 0; i <= 240 * 3; i++) time += timeline.advance(i * 1000 / 240, rate) ?? 0;
    assert.ok(Math.abs(time - 3) < 1e-9, `${rate}: ${time}`);
  }
  const timeline = new AnimationTimeline();
  timeline.advance(0, 30);
  assert.equal(timeline.advance(10, 30), null);
  assert.equal(timeline.advance(20, 120), 0.02);
  assert.equal(timeline.advance(25, 240), 0.005);
});

test('a visible stall is bounded and invalid or reversed timestamps cannot corrupt motion', () => {
  const timeline = new AnimationTimeline();
  timeline.advance(0, 120);
  assert.equal(timeline.advance(NaN, 120), null);
  assert.equal(timeline.advance(100, 0), null);
  assert.equal(timeline.advance(10000, 120), 0.05);
  assert.equal(timeline.advance(5000, 120), 0);
  assert.ok(Math.abs(timeline.advance(5010, 120) - 0.01) < 1e-10);
});

test('sampled gestures keep their duration on a slow display while physics remains bounded', () => {
  const clock = new AnimationTimeline();
  clock.advance(0, 120);
  assert.equal(clock.advance(400, 120), .05);
  assert.equal(clock.playbackDelta, .4);
  clock.setActive(false);
  clock.setActive(true);
  assert.equal(clock.advance(4000, 120), 0);
  assert.equal(clock.playbackDelta, 0);
});
