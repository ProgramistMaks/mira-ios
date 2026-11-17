// Geometry/skeleton QA of the actual bundled Vita, without a browser or GPU.
// Texture decoding is replaced by a pixel; bone, mesh, VRM and spring data are real.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { ArticulationRig, BodyController, BODY_CHANNELS } from '../Renderer/body.mjs';
import { SecondaryPhysics } from '../Renderer/secondary-physics.mjs';
import { HairDetail } from '../Renderer/hair-detail.mjs';
import { PlantedStance } from '../Renderer/stance.mjs';
import { ArmRig } from '../Renderer/arms.mjs';
import { REST } from '../Renderer/acting.mjs';
const loader=new GLTFLoader();
loader.register(parser=>{parser.loadTexture=async()=>{const t=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);t.needsUpdate=true;return t;};return new VRMLoaderPlugin(parser);});
const file=await readFile(new URL('../Renderer/public/character.vrm',import.meta.url));
const gltf=await loader.parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);VRMUtils.removeUnnecessaryVertices(vrm.scene);VRMUtils.combineSkeletons(vrm.scene);VRMUtils.combineMorphs(vrm);vrm.update(0);
const bone=name=>vrm.humanoid.getNormalizedBoneNode(name),sign=vrm.meta.metaVersion==='0'?1:-1;
const articulation=new ArticulationRig(bone,sign),controller=new BodyController(),physics=new SecondaryPhysics(vrm.springBoneManager),hair=new HairDetail(vrm.scene);
const height=new THREE.Box3().setFromObject(vrm.scene).getSize(new THREE.Vector3()).y;
const stance=new PlantedStance(vrm.scene,bone,height,-sign),arms=new ArmRig(bone,sign);
assert.equal(articulation.entries.filter(x=>x.kind==='finger').length,30);
const baseline=hair.triangles;hair.set('high');const high=hair.triangles;
assert.equal(baseline,26130);assert.equal(high,62046);
for(const e of hair.entries){assert.ok(e.high);const w=e.high.attributes.skinWeight;for(let i=0;i<w.count;i++)assert.ok(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5);}
hair.set('standard');assert.equal(hair.triangles,baseline);
// Actual VRM look-at and vowel morph channels, rather than UI-only values.
vrm.lookAt.autoUpdate=false;vrm.lookAt.yaw=22;vrm.lookAt.pitch=10;vrm.update(1/60);
assert.ok(vrm.humanoid.getRawBoneNode('leftEye').quaternion.angleTo(new THREE.Quaternion())>.01);
for(const vowel of ['aa','ih','ou','ee','oh']){
  assert.ok(vrm.expressionManager.getExpression(vowel), `Missing vowel ${vowel}`);
  vrm.expressionManager.setValue(vowel,.7);vrm.update(1/60);assert.equal(vrm.expressionManager.getValue(vowel),.7);
  vrm.expressionManager.setValue(vowel,0);
}
vrm.lookAt.yaw=0;vrm.lookAt.pitch=0;
let maxContactError=0,maxFingerAngle=0;
const ref=bone('leftIndexIntermediate'),other=bone('leftMiddleIntermediate');
controller.configure({mode:'manual',controls:{leftIndex1:1.1}});
for(let i=0;i<120;i++){const p=controller.update(REST,1/60);articulation.apply(p);}
assert.ok(ref.quaternion.angleTo(new THREE.Quaternion())>1);
assert.ok(other.quaternion.angleTo(new THREE.Quaternion())<.2);
maxFingerAngle=ref.quaternion.angleTo(new THREE.Quaternion());
for(const mode of ['natural','hands','mobility','legs','face']){
  controller.configure({mode});
  for(let i=0;i<(mode==='natural'?5400:720);i++){
    const p=controller.update(REST,1/60);stance.apply(p);arms.apply(p);articulation.apply(p);
    for(const name of ['spine','chest','neck','head'])bone(name)?.rotation.set(p[name+'X']??0,p[name+'Y']??0,p[name+'Z']??0);
    physics.configure({physics:true,wind:.7,softness:.7});vrm.update(1/60);
    for(const leg of stance.legs){
      const actual=vrm.scene.worldToLocal(leg.foot.getWorldPosition(new THREE.Vector3()));
      const error=actual.distanceTo(leg.anchor.clone().add(leg.offset));maxContactError=Math.max(error,maxContactError);
      assert.ok(error<1e-5,`Foot target lost: ${mode} ${error}`);
    }
    if(i%30===0)vrm.scene.traverse(node=>assert.ok(node.matrixWorld.elements.every(Number.isFinite)));
  }
}
// Shoulder elevation must lift, rather than depress, the wrist on the real rig.
for(const side of ['left','right']){
  const p={...REST,...Object.fromEntries(BODY_CHANNELS.map(c=>[c.id,c.initial]))};
  stance.apply(p);arms.apply(p);articulation.apply(p);
  const y=bone(side+'Hand').getWorldPosition(new THREE.Vector3()).y;
  p[side+'ShoulderLift']=.2;articulation.apply(p);
  assert.ok(bone(side+'Hand').getWorldPosition(new THREE.Vector3()).y>y,`Shoulder lift direction ${side}`);
}
// Each phalanx can move independently; wrist centre must stay fixed.
for(const entry of articulation.entries.filter(e=>e.kind==='finger')){
  const pose=Object.fromEntries(BODY_CHANNELS.map(c=>[c.id,0]));
  articulation.apply(pose);const before=bone(entry.side+'Hand').getWorldPosition(new THREE.Vector3());
  pose[entry.joint]=.65;articulation.apply(pose);
  assert.ok(entry.node.quaternion.angleTo(entry.rest)>.6);
  assert.ok(bone(entry.side+'Hand').getWorldPosition(new THREE.Vector3()).distanceTo(before)<1e-10);
}
console.log(JSON.stringify({fingerJoints:30,controls:BODY_CHANNELS.length,triangles:{standard:baseline,high},physics:physics.counts,maxContactError,maxFingerAngle,visualQA:false},null,2));
