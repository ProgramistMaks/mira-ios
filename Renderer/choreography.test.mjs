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

test('the reaching hand travels through intermediate keys and settles at a hold', async () => {
  const {at}=await import('./staged-gestures.mjs');
  const keys=[[0,0],[.2,.18],[.8,1],[2,1],[2.4,.6],[2.9,0]];
  const d=.0001;
  assert.ok((at(keys,.2+d)-at(keys,.2-d))/(2*d)>.5);
  assert.equal(at(keys,1.4),1);
  assert.ok((1-at(keys,.8-d))/d<.005);
  for(let i=0;i<=350;i++)assert.ok(at(keys,i/120)>=0 && at(keys,i/120)<=1);
});

test('the temple gesture absorbs the accent through the knees with both feet planted', () => {
  hold('temples',.72);
  const hips=point('hips'), knee=bone('leftLowerLeg').quaternion.clone();
  const foot=point('leftFoot'),other=point('rightFoot');
  advance(.34);
  assert.ok(point('hips').y-hips.y>.01);
  assert.ok(knee.angleTo(bone('leftLowerLeg').quaternion)>.035);
  assert.ok(foot.distanceTo(point('leftFoot'))<.001);
  assert.ok(other.distanceTo(point('rightFoot'))<.001);
});

test('opening greeting raises both wrists, releases one arm and holds the other beside the face',()=>{
  rig.configure('auto');
  rig.react('greeting');
  assert.equal(rig.clip,'welcome');
  advance(.55);
  const top=point('head');
  for(const side of ['left','right']) assert.ok(point(side+'Hand').y>top.y+.055);
  advance(.62);
  assert.ok(point('rightHand').y<top.y-.10);
  advance(.65);
  assert.ok(point('rightHand').distanceTo(point('head'))<.13);
  assert.ok(point('rightHand').y-point('leftHand').y>.15);
  const held=point('rightHand').sub(point('head'));
  advance(1.3);
  assert.ok(point('rightHand').sub(point('head')).distanceTo(held)<.012);
  rig.configure('wave');
  assert.equal(rig.clip,'wave');
});

test('dance gathers the wrists at the sternum before the side accent, with a wide stance',()=>{
  hold('dance',.7);
  const chest=bone('chest');
  const hand=side=>chest.worldToLocal(bone(side+'Hand').getWorldPosition(new Vector3())).divideScalar(height);
  const left=hand('left'), right=hand('right');
  assert.ok(left.distanceTo(right)<.09);
  assert.ok(left.y>right.y && right.y>0);
  assert.ok(point('rightFoot').distanceTo(point('leftFoot'))>.32);
  advance(.33);
  assert.ok(hand('left').y<0 && hand('right').y<0);
  advance(.40);
  assert.ok(hand('left').x<-.11 && hand('right').x<-.06);
});

test('breath continues across gesture changes and stops with Reduce Motion',()=>{
  hold('heart',.7);
  const cycle=rig.breathCycle;
  rig.configure('palms');
  rig.update(1/120);
  assert.ok(Math.abs(rig.breathCycle-cycle)<.003);
  const start=rig.inhale;
  advance(.5);
  assert.ok(Math.abs(start-rig.inhale)>.015);
  rig.update(1/120,{reduced:true});
  assert.equal(rig.inhale,0);
});
