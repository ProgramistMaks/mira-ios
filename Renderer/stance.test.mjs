import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Object3D, Quaternion, Vector3 } from 'three';
import { PlantedStance } from './stance.mjs';
import { ActingController, CLIPS, REST, sampleClip } from './acting.mjs';

function rig(forward = 1) {
  const turntable = new Group(), root = new Group(), nodes = {};
  turntable.add(root); root.rotation.y = forward === -1 ? Math.PI : 0;
  const joint = (name, parent, x, y, z) => {
    const node = new Object3D(); nodes[name] = node; parent.add(node); node.position.set(x, y, z); return node;
  };
  const hips = joint('hips', root, 0, 1, 0);
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const upper = joint(`${side}UpperLeg`, hips, sign * 0.09, -0.04, 0);
    const lower = joint(`${side}LowerLeg`, upper, 0, -0.45, 0);
    joint(`${side}Foot`, lower, 0, -0.43, 0);
  }
  const stance = new PlantedStance(root, name => nodes[name], 1.8, forward);
  const anchors = ['left', 'right'].map(side => ({
    foot: nodes[`${side}Foot`],
    position: root.worldToLocal(nodes[`${side}Foot`].getWorldPosition(new Vector3())),
    rotation: root.getWorldQuaternion(new Quaternion()).invert().multiply(nodes[`${side}Foot`].getWorldQuaternion(new Quaternion())),
  }));
  return { root, turntable, nodes, stance, anchors };
}
function contacts(rig) {
  for (const { foot, position, rotation } of rig.anchors) {
    const actual = rig.root.worldToLocal(foot.getWorldPosition(new Vector3()));
    assert.ok(actual.distanceTo(position) < 1e-6, `Foot drift ${actual.distanceTo(position)}`);
    const actualRotation = rig.root.getWorldQuaternion(new Quaternion()).invert().multiply(foot.getWorldQuaternion(new Quaternion()));
    assert.ok(actualRotation.angleTo(rotation) < 1e-6, 'Foot orientation changed');
  }
  for (const side of ['left', 'right']) {
    assert.equal(rig.nodes[`${side}LowerLeg`].position.length(), 0.45);
    assert.equal(rig.nodes[`${side}Foot`].position.length(), 0.43);
  }
}

test('all authored clips keep both feet planted without stretching either leg', () => {
  for (const forward of [1, -1]) {
    const model = rig(forward);
    for (const [name, clip] of Object.entries(CLIPS)) {
      for (let t = 0; t <= clip.duration; t += 1 / 30) {
        model.stance.apply(sampleClip(name, t)); contacts(model);
      }
    }
  }
});

test('contact anchors follow the turntable, translated parents and uniform scale', () => {
  const model = rig(-1);
  model.turntable.position.set(2, 3, -1); model.turntable.scale.setScalar(1.4);
  for (let i = 0; i < 60; i++) {
    model.turntable.rotation.set(0.12, i / 60, -0.08);
    model.stance.apply(sampleClip('speaking', i / 10)); contacts(model);
  }
});

test('rapid state changes stay continuous and reduce motion restores rest without accumulated drift', () => {
  const model = rig(), actor = new ActingController();
  let previous = model.nodes.hips.position.clone();
  for (const phase of ['thinking', 'speaking', 'listening', 'idle', 'thinking']) {
    actor.setPhase(phase);
    for (let i = 0; i < 20; i++) {
      model.stance.apply(actor.update(1 / 60)); contacts(model);
      assert.ok(model.nodes.hips.position.distanceTo(previous) < 0.01);
      previous.copy(model.nodes.hips.position);
    }
  }
  for (let i = 0; i < 120; i++) model.stance.apply(actor.update(1 / 60, true));
  assert.ok(model.nodes.hips.position.distanceTo(new Vector3(0, 1, 0)) < 1e-8);
  contacts(model);
  const rotations = Object.values(model.nodes).map(node => node.quaternion.clone());
  for (let i = 0; i < 1000; i++) model.stance.apply(REST);
  Object.values(model.nodes).forEach((node, i) => assert.ok(node.quaternion.angleTo(rotations[i]) < 1e-7));
});

test('unreachable lateral input lowers the pelvis, while invalid values cannot corrupt the rig', () => {
  const model = rig();
  model.stance.apply({ hipsSide: 10, hipsForward: -10, hipsYaw: 10, hipsRoll: 10 });
  contacts(model);
  assert.ok(model.nodes.hips.position.y < 1);
  model.stance.apply({ hipsSide: NaN, hipsDrop: Infinity, hipsYaw: -Infinity });
  contacts(model);
  assert.ok(Object.values(model.nodes).every(node => node.matrixWorld.elements.every(Number.isFinite)));
});

test('missing leg bones disable stance as a whole without moving the hips', () => {
  const model = rig();
  const stance = new PlantedStance(model.root, name => name === 'rightFoot' ? null : model.nodes[name], 1.8);
  const before = model.nodes.hips.position.clone();
  stance.apply(sampleClip('thinking', 2));
  assert.deepEqual(model.nodes.hips.position, before);
});

test('knee flex lifts its foot, opposite foot stays planted, ankles and toes do not stretch bones',()=>{
  for(const forward of [1,-1]){
    const model=rig(forward);
    const lengths=[model.nodes.leftLowerLeg.position.length(),model.nodes.leftFoot.position.length()];
    model.stance.apply({...REST,leftKnee:1.2,leftFootPitch:.3,leftFootSide:.03,hipsPitch:.1});
    const left=model.root.worldToLocal(model.nodes.leftFoot.getWorldPosition(new Vector3()));
    const right=model.root.worldToLocal(model.nodes.rightFoot.getWorldPosition(new Vector3()));
    assert.ok(left.y>model.anchors[0].position.y+.1);
    assert.ok(right.distanceTo(model.anchors[1].position)<1e-6);
    const target=model.stance.legs[0].anchor.clone().add(model.stance.legs[0].offset);assert.ok(left.distanceTo(target)<1e-6);
    assert.deepEqual([model.nodes.leftLowerLeg.position.length(),model.nodes.leftFoot.position.length()],lengths);
    model.stance.apply(REST);contacts(model);
  }
});
