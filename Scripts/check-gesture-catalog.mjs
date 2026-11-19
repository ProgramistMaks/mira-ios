// All 52 gesture trajectories through the production pose/rig stack, on actual Vita.
// Texture decoding is replaced by a pixel; bone, mesh, VRM and spring data are real.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { ArticulationRig, BodyController, BODY_CHANNELS } from '../Renderer/body.mjs';
import { PlantedStance } from '../Renderer/stance.mjs';
import { ArmRig } from '../Renderer/arms.mjs';
const loader=new GLTFLoader();
loader.register(parser=>{parser.loadTexture=async()=>{const t=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);t.needsUpdate=true;return t;};return new VRMLoaderPlugin(parser);});
const file=await readFile(new URL('../Renderer/public/character.vrm',import.meta.url));
const gltf=await loader.parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);VRMUtils.removeUnnecessaryVertices(vrm.scene);VRMUtils.combineSkeletons(vrm.scene);VRMUtils.combineMorphs(vrm);vrm.update(0);
const bone=name=>vrm.humanoid.getNormalizedBoneNode(name),sign=vrm.meta.metaVersion==='0'?1:-1;

import {ArmTargets} from '../Renderer/arm-targets.mjs';
import {PerformanceController} from '../Renderer/performance.mjs';
import {writeFile} from 'node:fs/promises';
import {encodeVariant,GESTURES} from '../Renderer/expression-library.mjs';

const root=vrm.scene,height=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
const arms=new ArmRig(bone,sign),rig=new ArticulationRig(bone,sign),targets=new ArmTargets(root,bone,height,sign);
const stance=new PlantedStance(root,bone,height,-sign);
const names=['hips','spine','chest','head','leftUpperArm','leftLowerArm','leftHand','leftIndexDistal','rightUpperArm','rightLowerArm','rightHand','rightIndexDistal'];
const rows=[];let maxFrameStep=0,maxElbow=0,maxTargetError=0,worst=null,maxAngularStep=0,worstAngle=null,maxRetargetError=0;
for(let g=0;g<GESTURES.length;g++){
 const actor=new PerformanceController(1),body=new BodyController(1);actor.configure({variant:encodeVariant(g,0,0,0),intensity:.7});
 const trajectory=[],orientation=[],samples=[],rotations=[];let previous=null,previousRotations=null;
 const lengths=arms.arms.map(a=>[a.lower.position.length(),a.hand.position.length()]);
 for(let i=0;i<=Math.ceil(GESTURES[g].duration*60);i++){
  const p=body.update(actor.update(1/60),1/60,false,{automatic:false});
  stance.apply(p);arms.apply(p);rig.apply(p);
  for(const n of ['spine','chest','neck','head'])bone(n)?.rotation.set(p[n+'X']??0,p[n+'Y']??0,p[n+'Z']??0);
  targets.apply(p);vrm.update(1/60);
  for(const channel of BODY_CHANNELS)assert.ok(Number.isFinite(p[channel.id])&&p[channel.id]>=channel.min&&p[channel.id]<=channel.max,`${g}:${channel.id}`);
  const frame=names.map(n=>bone(n).getWorldPosition(new THREE.Vector3()));
  if(previous)for(let j=0;j<frame.length;j++){const step=frame[j].distanceTo(previous[j]);if(step>maxFrameStep){maxFrameStep=step;worst={gesture:g,frame:i,bone:names[j]};}}previous=frame;
  const frameRotations=names.map(n=>bone(n).getWorldQuaternion(new THREE.Quaternion()));
  if(previousRotations)for(let j=0;j<names.length;j++){const angle=frameRotations[j].angleTo(previousRotations[j]);if(angle>maxAngularStep){maxAngularStep=angle;worstAngle={gesture:g,frame:i,bone:names[j]};}}
  previousRotations=frameRotations;
  for(const [j,a]of arms.arms.entries()){
    assert.ok(Math.abs(a.lower.position.length()-lengths[j][0])<1e-10);assert.ok(Math.abs(a.hand.position.length()-lengths[j][1])<1e-10);
    const upper=a.upper.getWorldPosition(new THREE.Vector3()),lower=a.lower.getWorldPosition(new THREE.Vector3()),hand=a.hand.getWorldPosition(new THREE.Vector3());
    const retargetError=vrm.humanoid.getRawBoneNode(a.side+'Hand').getWorldPosition(new THREE.Vector3()).distanceTo(hand);maxRetargetError=Math.max(maxRetargetError,retargetError);assert.ok(retargetError<1e-5,'Raw skin wrist differs from normalized wrist');
    const bend=lower.clone().sub(upper).angleTo(hand.clone().sub(lower));maxElbow=Math.max(maxElbow,bend);assert.ok(bend<2.65,`${g}: elbow ${bend}`);
    if((p[a.side+'ChestReach']??0)>.999999||(p[a.side+'WaveReach']??0)>.999999){
      const goal=targets.arms.find(t=>t.side===a.side).goal;
      const error=hand.distanceTo(goal);maxTargetError=Math.max(maxTargetError,error);assert.ok(error<1e-5);
      assert.ok(a.hand.quaternion.angleTo(new THREE.Quaternion())<=.600001,'Wrist bend exceeds limit');
    }
    assert.ok(a.hand.matrixWorld.elements.every(Number.isFinite));
  }
  if(i%6===0){samples.push(names.map(n=>root.worldToLocal(bone(n).getWorldPosition(new THREE.Vector3())).toArray()));rotations.push(names.map(n=>bone(n).quaternion.toArray()));}
 }
 const angularExcursion=names.map((n,j)=>Math.max(...rotations.map(r=>new THREE.Quaternion(...r[j]).angleTo(new THREE.Quaternion(...rotations[0][j])))));
 assert.ok(Math.max(...angularExcursion)>.02,`No visible joint rotation in ${GESTURES[g].id}`);
 const excursion=names.map((n,j)=>Math.max(...samples.map(s=>new THREE.Vector3(...s[j]).distanceTo(new THREE.Vector3(...samples[0][j])))));
 // Normalize trajectory time for cross-gesture comparisons, in model units.
 for(let k=0;k<32;k++){const idx=Math.round(k*(samples.length-1)/31);trajectory.push(...samples[idx].flat());orientation.push(...rotations[idx].flat());}
 rows.push({id:g,name:GESTURES[g].id,excursion:Object.fromEntries(names.map((n,i)=>[n,+excursion[i].toFixed(4)])),trajectory,orientation});
}

const pairs=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
 let distance=0;
 for(let n=0;n<names.length;n++){
  let sq=0;
  for(let k=0;k<32;k++){
   const p=(k*names.length+n)*3,q=(k*names.length+n)*4;
   const positional=new THREE.Vector3(...rows[i].trajectory.slice(p,p+3)).distanceTo(new THREE.Vector3(...rows[j].trajectory.slice(p,p+3)));
   const angular=new THREE.Quaternion(...rows[i].orientation.slice(q,q+4)).angleTo(new THREE.Quaternion(...rows[j].orientation.slice(q,q+4)));
   sq+=positional**2+(angular*.1)**2;
  }
  distance=Math.max(distance,Math.sqrt(sq/32));
 }
 pairs.push({a:rows[i].name,b:rows[j].name,distance:+distance.toFixed(5)});
}
assert.ok(maxAngularStep<.12,`Angular jump ${maxAngularStep}`);
assert.ok(maxFrameStep<.04,`Frame discontinuity ${maxFrameStep} ${JSON.stringify(worst)}`);
const metrics={maxFrameStep,maxElbow,maxTargetError,worst,maxAngularStep,worstAngle,maxRetargetError};
await writeFile('/tmp/mira-gesture-audit.json',JSON.stringify({rows,pairs,metrics},null,2));
console.log(JSON.stringify({count:rows.length,metrics,closest:pairs.sort((a,b)=>a.distance-b.distance).slice(0,18)},null,2));
