import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DataTexture, Quaternion, Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin, VRMUtils} from '@pixiv/three-vrm';
import {HairDetail} from './hair-detail.mjs';
import {VitaSecondary} from './vita-secondary.mjs';
import {SecondaryPhysics} from './secondary-physics.mjs';

const loader=new GLTFLoader();
loader.register(parser=>{
  parser.loadTexture=async()=>new DataTexture();
  return new VRMLoaderPlugin(parser);
});
const bytes=await readFile(new URL('./public/character.vrm',import.meta.url));
const {userData:{vrm:avatar}}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const root=avatar.scene;
VRMUtils.removeUnnecessaryVertices(root);
const rig=new VitaSecondary(avatar);
VRMUtils.rotateVRM0(avatar);
VRMUtils.combineSkeletons(root);
VRMUtils.combineMorphs(avatar);
const physics=new SecondaryPhysics(avatar.springBoneManager);
const rawHead=avatar.humanoid.getRawBoneNode('head');
const head=avatar.humanoid.getNormalizedBoneNode('head');
const neutral=new Quaternion();

function skinPoint(mesh,vertex,relativeTo) {
  const at=new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex);
  return relativeTo.worldToLocal(mesh.localToWorld(mesh.applyBoneTransform(vertex,at)));
}
function influence(mesh,vertex,matches) {
  const {skinIndex,skinWeight}=mesh.geometry.attributes;
  let sum=0;
  for(let k=0;k<4;k++) {
    const joint=mesh.skeleton.bones[skinIndex.getComponent(vertex,k)];
    if (matches(joint)) sum+=skinWeight.getComponent(vertex,k);
  }
  return sum;
}
function earLandmarks() {
  const found=[];
  root.traverse(mesh=>{
    if (!mesh.isSkinnedMesh) return;
    for(const {hinge} of rig.ears) {
      const p=mesh.geometry.attributes.position;
      let top=0,base=0;
      for(let i=1;i<p.count;i++) {
        if (p.getY(i)>p.getY(top)) top=i;
        if (p.getY(i)<p.getY(base)) base=i;
      }
      if(influence(mesh,top,j=>j===hinge)>.999) found.push({mesh,hinge,top,base});
    }
  });
  return found;
}

test('each ear can bend at the tip without pulling its base or the opposite ear at either hair density',()=>{
  const detail=new HairDetail(root);
  for(const mode of ['standard','high']) {
    detail.set(mode);
    const landmarks=earLandmarks();
    assert.equal(landmarks.length,2);
    for(const moving of landmarks) {
      const other=landmarks.find(l=>l!==moving);
      const tip=p=>skinPoint(p.mesh,p.top,rawHead);
      const base=p=>skinPoint(p.mesh,p.base,rawHead);
      root.updateMatrixWorld(true);
      const tipBefore=tip(moving), baseBefore=base(moving), otherBefore=tip(other);
      moving.hinge.rotation.z=.18;
      root.updateMatrixWorld(true);
      assert.ok(tip(moving).distanceTo(tipBefore)>.01);
      assert.ok(base(moving).distanceTo(baseBefore)<1e-7);
      assert.ok(tip(other).distanceTo(otherBefore)<1e-7);
      moving.hinge.quaternion.identity();
    }
  }
  detail.set('standard');
});

function cue(fps) {
  rig.reset();
  rig.listenCue();
  const samples=[];
  for(let i=0;i<fps;i++) {
    rig.update(1/fps,'idle',0,true);
    if ((i+1)%(fps/10)===0) samples.push(rig.ears.map(e=>e.hinge.quaternion.clone()));
  }
  return samples;
}

test('attention flick leads on one side, settles, and has comparable timing at 30 and 120 Hz',()=>{
  const fast=cue(120), slow=cue(30);
  const angles=fast[0].map(q=>q.angleTo(neutral)).sort((a,b)=>a-b);
  assert.ok(angles[1]>.05 && angles[0]<.005);
  fast.at(-1).forEach(q=>assert.ok(q.angleTo(neutral)<.0001));
  for(let t=0;t<slow.length;t++) for(let ear=0;ear<2;ear++) {
    assert.ok(fast[t][ear].angleTo(slow[t][ear])<.026,'cadence-dependent ear response');
  }
});

test('ears follow the head and a landing while remaining still on viewer rotation or pause',()=>{
  rig.reset();
  rig.update(0,'idle',0,true);
  const rotation=root.quaternion.clone(), y=head.position.y;
  root.rotateY(.65);
  rig.update(1/120,'idle',0,true);
  assert.ok(rig.ears.every(e=>e.angle.length()<1e-8));
  for(let i=0;i<16;i++) {
    head.position.y-=.003;
    rig.update(1/120,'idle',0,true);
  }
  assert.ok(rig.ears.every(e=>Math.abs(e.angle.z)>.025));
  head.position.y=y;
  const previous=rig.ears[0].hinge.quaternion.clone();
  rig.rebase();
  head.rotation.y=.45;
  rig.update(0,'idle',0,true);
  assert.ok(rig.ears[0].hinge.quaternion.angleTo(previous)<1e-7);
  for(let i=0;i<120;i++) rig.update(1/120,'idle',0,true);
  assert.ok(rig.ears.every(e=>e.angle.length()<.0001));
  for(let i=0;i<15;i++) {
    head.rotateY(-.02);
    rig.update(1/120,'idle',0,true);
  }
  assert.ok(rig.ears.every(e=>e.angle.y>.07));
  rig.rebase(); rig.update(1/120,'idle',0,false);
  assert.ok(rig.ears.every(e=>e.hinge.quaternion.angleTo(neutral)<1e-7));
  root.quaternion.copy(rotation); head.quaternion.identity();
});

test('chest expansion moves the weighted top and body surfaces together and keeps the collar stationary',()=>{
  const chest=avatar.humanoid.getRawBoneNode('upperChest');
  assert.equal(rig.ribs.children.length,2);
  assert.equal(physics.counts.chest,4);
  const landmarks=[];
  root.traverse(mesh=>{
    if (!mesh.isSkinnedMesh) return;
    const chestJoint=b=>/^J_Sec_[LR]_Bust[12]$/.test(b.name);
    let vertex=-1,weight=.85,collar=-1;
    for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      const w=influence(mesh,i,chestJoint);
      if(w>weight) {weight=w;vertex=i;}
      if(w===0 && influence(mesh,i,j=>j===chest)>.9) collar=i;
    }
    if(vertex!==-1) landmarks.push({mesh,vertex,collar});
  });
  assert.equal(landmarks.length,2);
  assert.ok(landmarks.some(l=>[l.mesh.material].flat().some(m=>m.name.includes('CLOTH'))));
  assert.ok(landmarks.some(l=>[l.mesh.material].flat().some(m=>m.name.includes('SKIN'))));
  const fixed=landmarks.find(l=>l.collar!==-1);
  assert.ok(fixed);
  rig.update(0,'idle',0,true); root.updateMatrixWorld(true);
  const before=landmarks.map(l=>skinPoint(l.mesh,l.vertex,chest));
  const collar=skinPoint(fixed.mesh,fixed.collar,chest);
  rig.update(0,'idle',1,true); root.updateMatrixWorld(true);
  const shifts=landmarks.map((l,i)=>skinPoint(l.mesh,l.vertex,chest).sub(before[i]));
  shifts.forEach(v=>assert.ok(v.length()>.003 && v.length()<.0041));
  assert.ok(shifts[0].distanceTo(shifts[1])<.0003);
  assert.ok(skinPoint(fixed.mesh,fixed.collar,chest).distanceTo(collar)<1e-7);
  rig.reset();
});

test('the original chest springs settle after a torso accent and retain their collision groups',()=>{
  const joint=physics.entries.find(e=>e.category==='chest').joint;
  const collisions=joint.colliderGroups;
  const chest=avatar.humanoid.getNormalizedBoneNode('upperChest');
  chest.quaternion.identity(); avatar.update(0); physics.reset();
  physics.configure({wind:1});
  const initial=joint.bone.quaternion.clone(), motion=[];
  for(let i=0;i<150;i++) {
    if(i<12) chest.rotateX(.015);
    avatar.update(1/120);
    motion.push(initial.angleTo(joint.bone.quaternion));
  }
  assert.ok(Math.max(...motion)>.02);
  assert.ok(motion.at(-1)<.005);
  assert.equal(joint.settings.gravityPower,0);
  assert.equal(joint.colliderGroups,collisions);
  chest.quaternion.identity(); avatar.update(0); physics.reset();
});
