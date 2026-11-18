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
  assert.equal(new Set(ids).size, ids.length);
  for (const name of ['jog', 'sprint', 'chair', 'chairIdle', 'jump', 'airborne', 'landing']) assert.ok(ids.includes(name));
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

test('temple dance opens the stance once, points both index fingers and transfers weight between planted feet',()=>{
  hold('templeDance',.12);
  const startWidth=Math.abs(point('leftFoot').x-point('rightFoot').x);
  advance(.80);
  const feet=['leftFoot','rightFoot'].map(point), hip=point('hips');
  assert.ok(Math.abs(feet[0].x-feet[1].x)>startWidth+.08);
  for(const side of ['left','right']){
    assert.ok(point(side+'Hand').y>point(side+'UpperArm').y-.04);
    const curl=f=>bone(side+f+'Intermediate').quaternion.angleTo(new Quaternion());
    assert.ok(curl('Middle')>curl('Index')+.30);
  }
  advance(.94);
  assert.ok(Math.abs(point('hips').x-hip.x)>.025);
  for(const [i,id] of ['leftFoot','rightFoot'].entries())
    assert.ok(feet[i].distanceTo(point(id))<.018,'foot slides during sway');
});

test('floor sitting lowers the pelvis, folds both knees out and settles the feet before the hands', () => {
  hold('idle',1);
  const standing=point('hips').y;
  hold('sitFloor',.37);
  const lowering=point('hips').y;
  advance(2.1);
  const pelvis=point('hips'), left=point('leftFoot'), right=point('rightFoot');
  assert.ok(standing-lowering>.06 && lowering-pelvis.y>.12);
  assert.ok(standing-pelvis.y>.33);
  assert.ok(Math.abs(left.x-right.x)<.10);
  const knees=['leftLowerLeg','rightLowerLeg'].map(point);
  const spread=Math.abs(knees[0].x-knees[1].x);
  assert.ok(spread>.12 && spread<.34, 'knee separation '+spread);
  assert.ok(knees.every(k=>k.y>pelvis.y+.02), 'knees must finish above the seated pelvis');
  assert.ok(point('leftHand').distanceTo(point('rightHand'))<.12);
  assert.ok(point('leftHand').y<pelvis.y+.14);
  advance(.7);
  assert.ok(point('leftFoot').distanceTo(left)<.003 && point('rightFoot').distanceTo(right)<.003);
  hold('idle',1);
  assert.ok(Math.abs(point('hips').y-standing)<.02);
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

test('the closing step clears the ground, then sets down the toe before the heel',()=>{
  hold('dance',1.30);
  const lead=point('leftFoot'),hips=point('hips');
  advance(.15);
  const airborne=point('rightToes');
  advance(.15);
  const toe=point('rightToes'),ankle=point('rightFoot');
  const padRotation=bone('rightToes').getWorldQuaternion(new Quaternion());
  assert.ok(airborne.y-toe.y>.010,'toe never cleared the floor');
  advance(.08);
  assert.ok(point('rightToes').distanceTo(toe)<.0005,'forefoot slipped during heel placement');
  assert.ok(padRotation.angleTo(bone('rightToes').getWorldQuaternion(new Quaternion()))<.002);
  assert.ok(ankle.y-point('rightFoot').y>.006,'heel did not settle after the toe landed');
  assert.ok(lead.distanceTo(point('leftFoot'))<.001);
  assert.ok(point('rightFoot').distanceTo(lead)<.12);
  assert.ok(point('hips').x-hips.x>.06);
  advance(.82);
  assert.ok(point('rightFoot').distanceTo(point('leftFoot'))>.29);
});

test('returning from a wide stance steps each foot across while the other bears weight',()=>{
  for(const hz of [30,120]){
    hold('dance',6);
    const toes=()=>['leftToes','rightToes'].map(point);
    const start=toes(),highest=[0,0],slide=[0,0];
    let previous=start;
    rig.configure('idle');
    for(let i=0;i<hz*.6;i++){
      rig.update(1/hz);
      const feet=toes(),lift=feet.map((p,j)=>p.y-start[j].y);
      assert.ok(Math.min(...lift)<.001,'both feet are airborne');
      feet.forEach((p,j)=>{
        highest[j]=Math.max(highest[j],lift[j]);
        if(Math.max(p.y,previous[j].y)-start[j].y<.003)
          slide[j]+=Math.hypot(p.x-previous[j].x,p.z-previous[j].z);
      });
      previous=feet;
    }
    for(let j=0;j<2;j++){
      assert.ok(highest[j]>.025,'foot travels without a step');
      assert.ok(slide[j]<.001,'planted shoe skates');
      assert.ok(Math.abs(previous[j].x-start[j].x)>.07);
      assert.ok(Math.abs(previous[j].y-start[j].y)<.001);
    }
  }
});

test('interrupting a step carries the airborne foot and Reduce Motion ends the transfer',()=>{
  hold('dance',6);rig.configure('idle');
  advance(.10);
  const ankle=point('rightFoot'),support=point('leftFoot');
  rig.configure('fold');rig.update(1/120);
  assert.ok(point('rightFoot').distanceTo(ankle)<.018);
  assert.ok(point('leftFoot').distanceTo(support)<.001);
  rig.update(1/120,{reduced:true});
  assert.equal(rig.stance.transferring,false);
  advance(.6,{reduced:true});
  const still=point('rightFoot');
  advance(.15,{reduced:true});
  assert.ok(point('rightFoot').distanceTo(still)<1e-6);
  rig.update(1/120);
});

test('both hands keep a continuous elbow plane and palm orientation during the greeting',()=>{
  for(const hz of [30,60,120,240]){
    rig.configure('auto');rig.react('greeting');
    const previous={};
    for(let tick=1;tick<=hz*4;tick++){
      rig.update(1/hz);
      for(const side of ['left','right']){
        const elbow=point(side+'LowerArm'),palm=bone(side+'Hand').getWorldQuaternion(new Quaternion());
        const last=previous[side],time=tick/hz;
        if(last && time>.45){
          assert.ok(palm.angleTo(last.palm)*hz<28,side+' palm turned abruptly at '+time);
          const resting=side==='left' && time>2 && time<3.3;
          assert.ok(elbow.distanceTo(last.elbow)*hz<(resting?.72:2.35),side+' elbow jumped at '+time);
          if(resting){
            const fingers=point('leftIndexDistal').sub(point('leftHand')).normalize();
            assert.ok(fingers.y<-.85 && Math.abs(fingers.x)<.36,'relaxed hand points sideways');
          }
        }
        previous[side]={elbow,palm};
      }
    }
  }
});

test('partial reaches leave their hold continuously and retain their speed on interruption',async()=>{
  const {SHOTS,sampleHand}=await import('./staged-gestures.mjs');
  for(const lane of [SHOTS.shrug.right,SHOTS.heart.left,SHOTS.skip.left]){
    for(const time of [lane.times[2],lane.times[3]]){
      const before=new Vector3(...sampleHand(lane,time-.0001).position);
      const after=new Vector3(...sampleHand(lane,time+.0001).position);
      assert.ok(before.distanceTo(after)<.00001);
    }
  }
  const dt=1/120;
  rig.configure('palms');rig.replay();
  for(let i=1;i<232;i++)rig.update(dt);
  const a=point('leftHand');rig.update(dt);const b=point('leftHand');
  const incoming=b.clone().sub(a);
  rig.configure('cheek');rig.update(dt);
  const outgoing=point('leftHand').sub(b);
  assert.ok(incoming.length()>.005);
  assert.ok(outgoing.distanceTo(incoming)<incoming.length()*.3);

  rig.configure('dance');rig.replay();
  for(let i=0;i<169;i++)rig.update(dt);
  const foot=point('rightFoot');rig.update(dt);const takeoff=point('rightFoot');
  const stride=takeoff.clone().sub(foot);
  rig.configure('fold');rig.update(dt);
  assert.ok(stride.length()>.006);
  assert.ok(point('rightFoot').sub(takeoff).distanceTo(stride)<.3*stride.length());
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

// Independently read wrist and elbow positions in the desktop recordings.
// Times start when the selected action appears. Coordinates use torso lengths.
test('desktop greeting and floor sit track the visible arms at eight checkpoints', () => {
  const clips={
 arrival:[[.84,.41,.77,.57,.48,-.42,.82,-.58,.46],[1.28,.49,-.37,.55,-.54,-.50,-.38,-.54,-.54],[2.64,.52,-1.01,.51,-.55,-.52,-.94,-.48,-.55],[4.43,.53,-1.12,.48,-.59,-.28,-.15,-.38,-.53]],
 sitFloor:[[.36,.74,-.35,.51,-.67,-.62,-.42,-.51,-.69],[.82,.29,-.51,.32,-.86,-.49,-.56,-.32,-.86],[1.75,.16,-.86,.39,-.66,-.19,-.86,-.41,-.65],[3.10,.14,-.85,.38,-.65,-.18,-.85,-.40,-.64]]
};
  for (const [id,frames] of Object.entries(clips)) {
    hold('idle',1);
    rig.configure(id); rig.replay();
    const errors=[];
    for(const [time,...marks] of frames){
      while(rig.age<time-1e-5) rig.update(1/120);
      const center=point('leftUpperArm').lerp(point('rightUpperArm'),.5);
      const span=center.distanceTo(point('hips'));
      ['leftHand','leftLowerArm','rightHand','rightLowerArm'].forEach((name,i)=>{
        const v=point(name).sub(center).divideScalar(span);
        errors.push(Math.hypot(v.x-marks[2*i],v.y-marks[2*i+1]));
      });
    }
    errors.sort((a,b)=>a-b);
    assert.ok((errors[7]+errors[8])/2<.075,id+' median arm error');
    assert.ok(errors[14]<(id==='arrival'?.12:.30),id+' 90th percentile arm error');
  }
});

test('the desktop entrance clears the viewport, lands and restores framing on interruption', () => {
  hold('arrival',.05); assert.ok(rig.viewOffset>.85);
  advance(.94); assert.ok(rig.viewOffset<-.065);
  advance(.30); assert.ok(rig.viewOffset>0);
  hold('sitFloor',1.6); assert.ok(rig.viewOffset<-.08);
  rig.configure('idle'); rig.update(1/120);
  assert.ok(rig.viewOffset<-.06);
  advance(.42); assert.equal(rig.viewOffset,0);
  hold('arrival',.05); rig.update(1/60,{reduced:true});
  assert.equal(rig.viewOffset,0);
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
  const gestures = new Set();
  for(let cycle=0;cycle<8;cycle++){
    assert.equal(rig.clip,'idle');
    assert.ok(rig.holdUntil>=9);
    rig.age=rig.holdUntil;rig.update(1/120);
    assert.ok(['fold','cheek','nod','palms','temples','heart'].includes(rig.clip));
    gestures.add(rig.clip);
    rig.age=rig.holdUntil;rig.update(1/120);
  }
  assert.ok(gestures.size >= 3, 'automatic resting gestures rotate through the pool');
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

test('seating follows enter, idle, and exit and preserves the configured gesture', () => {
  rig.configure('fold');
  advance(.5);
  const standing = point('hips').y;
  rig.setSeated(true);
  advance(.7);
  assert.equal(rig.track, 'chairIn');
  advance(1);
  assert.equal(rig.track, 'chairIdle');
  assert.ok(point('hips').y < standing - .12, 'the pelvis should lower to chair height');
  rig.configure('jog');
  advance(.7, { phase:'listening' });
  assert.equal(rig.track, 'chairIdle');
  rig.setSeated(false);
  advance(.45);
  assert.equal(rig.track, 'chairOut');
  advance(1);
  assert.equal(rig.clip, 'jog');
});

test('the jump plays takeoff and air before landing and does not restart while held', () => {
  hold('jump', .7);
  assert.equal(rig.track, 'jumpStart');
  advance(.75);
  assert.equal(rig.track, 'jumpAir');
  advance(.8);
  assert.equal(rig.track, 'jumpLand');
  advance(2);
  const landing = point('hips');
  advance(.5);
  assert.ok(landing.distanceTo(point('hips')) < 1e-5);
});

test('the seated preview lowers its framing to keep the feet in view', () => {
  hold('chair', 2);
  assert.equal(rig.track, 'chairIdle');
  assert.ok(rig.viewOffset < -.07);
  advance(3.2);
  assert.equal(rig.track, 'chairOut');
  assert.ok(rig.viewOffset > -.06);
});
