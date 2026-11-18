import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Scene } from 'three';
import { InteractiveReactions } from './interactive-reactions.mjs';

function rig(armSign = 1) {
  const scene = new Scene(), head = new Group(), chest = new Group();
  scene.add(head, chest);
  const camera = new PerspectiveCamera();
  const reactions = new InteractiveReactions(scene, head, chest, 1, armSign, () => .35);
  let arms, fingers;
  const armTargets = {apply(_pose, paths) { arms = structuredClone(paths); }};
  const articulation = {apply(pose) { fingers = {...pose}; }};
  return {
    reactions,
    step(thinking = false, reduced = false) {
      head.rotation.set(0, 0, 0);
      reactions.update(1 / 120, thinking, reduced, armTargets, articulation);
      reactions.drawHearts(1 / 120, camera);
      return {arms, fingers, ...reactions.status, tilt: head.rotation.z};
    },
  };
}

test('pointer travel accumulates across frames and a stroke reacts independently of typing', () => {
  const {step, reactions} = rig();
  for (let i = 0; i < 5; i++) {
    reactions.stroke(2, 0);
    step(true);
  }
  let state;
  for (let i = 0; i < 24; i++) state = step(true);
  assert.ok(state.hearts > 0);
  assert.ok(state.smile > .7 && state.tilt > .04);
  assert.equal(state.keyboard, true);
  reactions.endStroke();
  for (let i = 0; i < 210; i++) state = step(true);
  assert.equal(state.hearts, 0);
  assert.ok(state.smile < .01);
  assert.equal(state.keyboard, true);
});

test('typing uses both wrists and different keys, and stops on completion or reduced motion', () => {
  for (const sign of [-1, 1]) {
    const {step, reactions} = rig(sign);
    const lit = new Set();
    let pressedDigit = false, state;
    for (let i = 0; i < 260; i++) {
      state = step(true);
      if (state.key) lit.add(state.key);
      if (state.fingers && Object.values(state.fingers).some(bend => bend > .55)) pressedDigit = true;
    }
    assert.ok(lit.size >= 3 && pressedDigit);
    assert.ok(state.arms.left.weight > .9 && state.arms.right.weight > .9);
    assert.ok(state.arms.left.position[0] > 0 && state.arms.right.position[0] > 0);
    for (let i = 0; i < 140; i++) state = step();
    assert.equal(state.keyboard, false);
    assert.equal(state.key, null);
    reactions.preview('typing');
    reactions.preview('pet');
    assert.equal(step().keyboard, true);
    state = step(true, true);
    assert.equal(state.keyboard, false);
    assert.equal(state.hearts, 0);
    assert.equal(state.smile, 0);
  }
});
