import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DataTexture, Box3, Quaternion, Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin, VRMUtils} from '@pixiv/three-vrm';
import {ArmTargets} from './arm-targets.mjs';
import {ArticulationRig} from './body.mjs';
import {PlantedStance} from './stance.mjs';
import {CHOREOGRAPHY, ChoreographyRig} from './choreography.mjs';

// Use Vita's actual bone proportions. Materials are irrelevant to joint paths.
const loader = new GLTFLoader();
loader.register(parser => {
  parser.loadTexture = async () => new DataTexture();
  return new VRMLoaderPlugin(parser);
});
const file = await readFile(new URL('./public/character.vrm', import.meta.url));
const model = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset+file.byteLength), '');
const avatar = model.userData.vrm;
VRMUtils.rotateVRM0(avatar);
const bone = name => avatar.humanoid.getNormalizedBoneNode(name);
const rig = new ChoreographyRig(avatar, () => .25);
const sign = avatar.meta.metaVersion === '0' ? 1 : -1;
const height = new Box3().setFromObject(avatar.scene).getSize(new Vector3()).y;
rig.bind(new PlantedStance(avatar.scene, bone, height, -sign),
  new ArmTargets(avatar.scene, bone, height, sign), new ArticulationRig(bone, sign));
function advance(seconds, state) {
  for (let i=0; i<Math.round(seconds*60); i++) rig.update(1/60, state);
}
function hold(id, time=1.5) {
  rig.configure(id);
  rig.replay();
  advance(time);
}
const point = name => bone(name).getWorldPosition(new Vector3()).divideScalar(height);

test('all menu clips produce finite, moving, different trajectories on Vita', () => {
  const ids = CHOREOGRAPHY.map(entry => entry.id);
  const samples = new Set();
  assert.equal(new Set(ids).size,16);
  for (const id of ids) {
    hold(id,.1);
    const trajectory = [], names = ['leftHand','rightHand','leftFoot','rightFoot','head'];
    for (let i=0; i<32; i++) {
      advance(.1);
      const positions = names.flatMap(name => point(name).toArray());
      const rotations = bone('head').getWorldQuaternion(new Quaternion()).toArray();
      assert.ok([...positions,...rotations].every(Number.isFinite),id);
      trajectory.push([...positions,...rotations].map(x=>x.toFixed(3)).join(','));
    }
    assert.ok(new Set(trajectory).size>5,id+' should move');
    const fingerprint = trajectory.join('|');
    assert.ok(!samples.has(fingerprint),id+' duplicated an existing path');
    samples.add(fingerprint);
  }
});

test('chest hold, cheek, wave, index fingers and raised foot are distinguishable on Vita', () => {
  hold('heart');
  const chestHand=point('rightHand');
  assert.ok(chestHand.distanceTo(point('chest'))<.16);
  advance(.6);
  assert.ok(chestHand.distanceTo(point('rightHand'))<.012,'chest hold wanders');
  hold('cheek');
  const cheekHand=point('rightHand');
  assert.ok(cheekHand.y>chestHand.y);
  assert.ok(cheekHand.distanceTo(point('head'))<cheekHand.distanceTo(point('chest')));
  assert.ok(cheekHand.distanceTo(point('head'))<chestHand.distanceTo(point('head'))-.035);
  hold('wave',.94);
  const waveHand=point('rightHand'), wrist=bone('rightHand').quaternion.clone();
  advance(.30);
  assert.ok(waveHand.distanceTo(point('rightHand'))>.025);
  assert.ok(wrist.angleTo(bone('rightHand').quaternion)>.04,'wave has no wrist motion');
  hold('temples');
  for (const side of ['left','right']) {
    const fingers=['Index','Middle'].map(name=>bone(side+name+'Intermediate').quaternion.angleTo(new Quaternion()));
    assert.ok(fingers[1]-fingers[0]>.5,side+' index should extend');
  }
  hold('skip',.7);
  assert.ok(point('leftFoot').y-point('rightFoot').y>.035);
});

test('side step opens on a planted foot and transfers to the other support leg', () => {
  hold('dance',.62);
  const lead=point('leftFoot'), trail=point('rightFoot');
  advance(.35);
  assert.ok(point('leftFoot').distanceTo(lead)<.001,'planted foot slides');
  assert.ok(point('rightFoot').y-trail.y>.018,'trailing heel never rises');
  advance(2);
  assert.ok(point('leftFoot').y-point('rightFoot').y>.018,'support failed to alternate');
});

test('dance command holds across conversation phases, then restores manual selection', () => {
  hold('heart');
  rig.react('dance');
  advance(6,{phase:'speaking',audio:.3});
  assert.equal(rig.clip,'dance');
  advance(6.1,{phase:'listening'});
  assert.equal(rig.clip,'heart');
  rig.update(1/60,{reduced:true});
  assert.equal(rig.clip,'idle');
  rig.update(1/60);
  assert.equal(rig.clip,'heart');
  rig.configure('auto');
  rig.react('touch');
  assert.equal(rig.clip,'temples');
  rig.react('touch');
  assert.equal(rig.clip,'heart');
});
