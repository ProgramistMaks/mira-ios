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
import checkpoints from './fixtures/reference-checkpoints.json' with {type:'json'};

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
  assert.ok(point('rightHand').sub(point('head')).distanceTo(held)<.035);
  assert.ok(point('rightIndexDistal').distanceTo(point('head'))<.11);
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
  advance(.17);
  const shoulder=point('leftUpperArm').lerp(point('rightUpperArm'),.5);
  assert.ok(point('leftHand').x-shoulder.x>.15 && point('rightHand').x-shoulder.x>.085);
  const swept=point('leftHand').y;
  advance(.20);
  assert.ok(point('leftHand').y-swept>.015);
});

test('the trailing foot closes on a loaded leg and clears the ground before reopening',()=>{
  hold('dance',1.33);
  const lead=point('leftFoot'),trail=point('rightFoot'),hips=point('hips');
  advance(.16);
  assert.ok(point('rightFoot').y-trail.y>.025);
  advance(.16);
  assert.ok(lead.distanceTo(point('leftFoot'))<.001);
  assert.ok(Math.abs(point('rightFoot').y-trail.y)<.001);
  assert.ok(point('rightFoot').distanceTo(lead)<.12);
  assert.ok(point('hips').x-hips.x>.06);
  advance(.85);
  assert.ok(point('rightFoot').distanceTo(point('leftFoot'))>.29);
});

test('visible wrists and elbows follow intermediate source frames on Vita',()=>{
  const names=['leftHand','leftLowerArm','rightHand','rightLowerArm'];
  for(const [clip,{start,frames}] of Object.entries(checkpoints)){
    if(clip==='welcome'){rig.configure('auto');rig.react('greeting');}
    else {rig.configure(clip);rig.replay();}
    const errors=[];
    for(const [frame,...marks] of frames){
      const time=start+frame/30;
      while(rig.age+1/240<time)rig.update(1/120);
      const center=point('leftUpperArm').lerp(point('rightUpperArm'),.5),hips=point('hips');
      const span=Math.hypot(center.x-hips.x,center.y-hips.y);
      marks.forEach((mark,i)=>{
        if(mark){
          const joint=point(names[i]).sub(center).divideScalar(span);
          errors.push(Math.hypot(joint.x-mark[0],joint.y-mark[1]));
        }
      });
    }
    errors.sort((a,b)=>a-b);
    assert.ok(errors[Math.floor(errors.length/2)]<.09,clip+' median projected error');
    assert.ok(errors[Math.ceil(.9*errors.length)-1]<.16,clip+' 90th percentile projected error');
  }
});

test('reference motion is stable at different refresh rates and follows viewer rotation',()=>{
  const root=avatar.scene,orientation=root.quaternion.clone();
  const markers=['leftHand','rightHand','leftLowerArm','rightLowerArm','leftFoot','rightFoot'];
  const trajectory=(hz,turn)=>{
    root.quaternion.copy(orientation);
    root.rotateY(turn);
    rig.breathCycle=0;rig.elapsed=0;
    rig.configure('dance');rig.replay();
    const result=[];
    for(let tick=1;tick<=hz*2;tick++){
      rig.update(1/hz);
      if(tick>=hz*.5 && tick%(hz/10)===0)result.push(...markers.map(id=>
        root.worldToLocal(bone(id).getWorldPosition(new Vector3()))));
    }
    return result;
  };
  try{
    const front=trajectory(120,0);
    for(const hz of [30,60,120]){
      const rotated=trajectory(hz,.91);
      rotated.forEach((p,i)=>assert.ok(p.distanceTo(front[i])<1e-6));
    }
  }finally{root.quaternion.copy(orientation);}
});

test('both hands curl toward the palm, spread the outer digits and oppose the thumb',()=>{
  for(const side of ['left','right']){
    const hand=bone(side+'Hand');
    const local=id=>hand.worldToLocal(bone(side+id).getWorldPosition(new Vector3()));
    rig.articulation.apply({});
    const index=local('IndexDistal'),middle=local('MiddleDistal');
    const width=index.distanceTo(local('LittleDistal'));
    const gap=local('ThumbDistal').distanceTo(local('MiddleProximal'));
    rig.articulation.apply({[side+'Index0']:1,[side+'Index1']:1});
    assert.ok(local('IndexDistal').y<index.y-.03);
    assert.ok(local('MiddleDistal').distanceTo(middle)<1e-6);
    rig.articulation.apply({[side+'Spread']:.22,[side+'ThumbOpposition']:.5});
    assert.ok(local('IndexDistal').distanceTo(local('LittleDistal'))>width+.01);
    assert.ok(local('ThumbDistal').distanceTo(local('MiddleProximal'))<gap-.02);
  }
});

test('uninterrupted idle alternates quiet shifts and sustained rest',()=>{
  rig.configure('auto');rig.begin('idle');rig.phase='idle';
  for(let cycle=0;cycle<8;cycle++){
    assert.equal(rig.clip,'idle');
    assert.ok(rig.holdUntil>=9);
    rig.age=rig.holdUntil;rig.update(1/120);
    assert.ok(['fold','cheek','nod'].includes(rig.clip));
    rig.age=rig.holdUntil;rig.update(1/120);
  }
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
