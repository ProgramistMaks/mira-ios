import test from 'node:test';
import assert from 'node:assert/strict';
import { motion, speechLevel, SpeechSamples } from './motion.mjs';

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

test('queued speech keeps its original age rather than receiving a fresh lifetime', () => {
  const samples = new SpeechSamples();
  assert.equal(samples.receive(0.8, 1000, 1, 1100, 500), true);
  assert.equal(samples.level(570), 0.8);
  assert.equal(samples.level(581), 0);
  assert.equal(samples.receive(1, 1000, 2, 1200, 600), false);
  assert.equal(samples.level(600), 0);
});

test('duplicate and reordered packets cannot overwrite a newer mouth pose', () => {
  const samples = new SpeechSamples();
  samples.receive(0.7, 1000, 5, 1000, 200);
  assert.equal(samples.receive(0, 1000, 4, 1000, 200), false);
  assert.equal(samples.receive(0, 1000, 5, 1000, 200), false);
  assert.equal(samples.level(200), 0.7);
});

test('hiding and showing the scene rejects packets sampled before visibility returned', () => {
  const samples = new SpeechSamples();
  samples.receive(0.8, 1000, 1, 1000, 200);
  samples.setActive(false, 1010);
  assert.equal(samples.level(210), 0);
  assert.equal(samples.receive(1, 1020, 2, 1020, 220), false);
  samples.setActive(true, 1030);
  assert.equal(samples.receive(1, 1029, 3, 1040, 240), false);
  assert.equal(samples.level(240), 0);
  assert.equal(samples.receive(0.5, 1040, 4, 1040, 240), true);
  assert.equal(samples.level(240), 0.5);
});

test('phase reset closes the mouth and a new phase requires newly sampled audio', () => {
  const samples = new SpeechSamples();
  samples.receive(1, 1000, 1, 1000, 0);
  samples.reset(1050);
  assert.equal(samples.receive(1, 1040, 2, 1060, 60), false);
  assert.equal(samples.level(60), 0);
  samples.receive(0.6, 1060, 3, 1060, 60);
  assert.equal(motion(0, 'speaking', true, samples.level(60)).mouth, 0.6);
});

test('invalid timestamps, future audio and invalid sequence numbers cannot animate speech', () => {
  for (const timestamp of [NaN, Infinity, -Infinity, 1200]) {
    const samples = new SpeechSamples();
    assert.equal(samples.receive(1, timestamp, 1, 1000, 0), false);
    assert.equal(samples.level(0), 0);
  }
  for (const sequence of [NaN, Infinity, 0.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    const samples = new SpeechSamples();
    assert.equal(samples.receive(1, 1000, sequence, 1000, 0), false);
    assert.equal(samples.level(0), 0);
  }
});
