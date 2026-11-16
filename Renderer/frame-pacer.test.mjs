import test from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer } from './frame-pacer.mjs';

test('30/60/120/240 targets follow the display without duplicating callbacks', () => {
  for (const display of [30, 60, 90, 120, 144, 240]) {
    for (const target of [30, 60, 120, 240]) {
      const pacer = new FramePacer();
      let frames = 0;
      for (let i = 0; i < display * 10; i++) {
        if (pacer.shouldRender(i * 1000 / display, target)) frames++;
      }
      assert.ok(Math.abs(frames - Math.min(display, target) * 10) <= 1,
        `${display} Hz / ${target} fps: ${frames} frames`);
    }
  }
});

test('small display timestamp jitter does not halve 120/240 fps or accumulate drift', () => {
  for (const rate of [120, 240]) {
    const pacer = new FramePacer();
    let frames = 0;
    for (let i = 0; i < rate * 30; i++) {
      const jitter = i % 2 === 0 ? 0 : -0.03;
      if (pacer.shouldRender(i * 1000 / rate + jitter, rate)) frames++;
    }
    assert.equal(frames, rate * 30);
  }
});

test('rate changes and long pauses render once then resume without catch-up bursts', () => {
  const pacer = new FramePacer();
  assert.equal(pacer.shouldRender(0, 30), true);
  assert.equal(pacer.shouldRender(4, 240), true);
  assert.equal(pacer.shouldRender(4.01, 240), false);
  assert.equal(pacer.shouldRender(5000, 240), true);
  assert.equal(pacer.shouldRender(5000, 240), false);
  assert.equal(pacer.shouldRender(5005, 30), true);
  assert.equal(pacer.shouldRender(5010, 30), false);
  assert.equal(pacer.shouldRender(0, 30), true);
});

test('invalid inputs do not poison the next valid display callback', () => {
  const pacer = new FramePacer();
  for (const rate of [NaN, Infinity, -1, 0, 241, 120.5]) {
    assert.equal(pacer.shouldRender(0, rate), false);
  }
  for (const timestamp of [NaN, Infinity, -Infinity]) {
    assert.equal(pacer.shouldRender(timestamp, 120), false);
  }
  assert.equal(pacer.shouldRender(0, 120), true);
});
