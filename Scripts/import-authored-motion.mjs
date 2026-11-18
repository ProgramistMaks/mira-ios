// Build-time only. Convert CC0 UAL1 clips to model-independent world deltas.
// Usage: node Scripts/import-authored-motion.mjs /path/to/UAL1_Standard.glb
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const input=process.argv[2];if(!input)throw Error('Provide the downloaded CC0 UAL1_Standard.glb');
const bytes=await readFile(input),loader=new GLTFLoader();
const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const mapping={hips:'pelvis',spine:'spine_01',chest:'spine_02',upperChest:'spine_03',neck:'neck_01',head:'Head'};
for(const [side,s] of [['left','l'],['right','r']]){
 for(const [vrm,src] of Object.entries({Shoulder:'clavicle',UpperArm:'upperarm',LowerArm:'lowerarm',Hand:'hand',UpperLeg:'thigh',LowerLeg:'calf',Foot:'foot',Toes:'ball'}))mapping[side+vrm]=`${src}_${s}`;
 for(const [finger,src] of [['Thumb','thumb'],['Index','index'],['Middle','middle'],['Ring','ring'],['Little','pinky']])
  for(const [i,part]of (finger==='Thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal']).entries())mapping[side+finger+part]=`${src}_0${i+1}_${s}`;
}
const mixer=new T.AnimationMixer(gltf.scene);
const rest=mixer.clipAction(gltf.animations.find(c=>c.name==='A_TPose'));rest.play();mixer.setTime(0);gltf.scene.updateMatrixWorld(true);
const nodes=Object.values(mapping).map(n=>gltf.scene.getObjectByName(n));if(nodes.some(n=>!n))throw Error('Missing mapped bone');
const inverseRest=nodes.map(n=>n.getWorldQuaternion(new T.Quaternion()).invert());
const hips=nodes[0],origin=hips.getWorldPosition(new T.Vector3()),scale=origin.y;
const clips={};const q=new T.Quaternion(),v=new T.Vector3();
const takes = {
 idle:'Idle_Loop', dance:'Dance_Loop', walk:'Walk_Loop', jog:'Jog_Fwd_Loop', sprint:'Sprint_Loop',
 chairIn:'Sitting_Enter', chairIdle:'Sitting_Idle_Loop', chairOut:'Sitting_Exit',
 jumpStart:'Jump_Start', jumpAir:'Jump_Loop', jumpLand:'Jump_Land',
};
for(const [id,name]of Object.entries(takes)){
 mixer.stopAllAction();const clip=gltf.animations.find(c=>c.name===name);const action=mixer.clipAction(clip).setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
 const frames=Math.round(clip.duration*30)+1,rotations=[],positions=[];
 for(let f=0;f<frames;f++){
  mixer.setTime(Math.min(f/30,clip.duration));gltf.scene.updateMatrixWorld(true);
  hips.getWorldPosition(v).sub(origin).divideScalar(scale);positions.push(...v.toArray().map(x=>+x.toFixed(6)));
  for(let i=0;i<nodes.length;i++){
   nodes[i].getWorldQuaternion(q).multiply(inverseRest[i]).normalize();
   // Keep the same hemisphere between frames for stable interpolation.
   if(f&&q.dot(new T.Quaternion().fromArray(rotations,((f-1)*nodes.length+i)*4))<0)q.set(-q.x,-q.y,-q.z,-q.w);
   rotations.push(...q.toArray().map(x=>+x.toFixed(6)));
  }
 }
 clips[id]={take:name,duration:clip.duration,fps:30,frames,positions,rotations};
}
const out={version:1,source:{name:'Quaternius Universal Animation Library Standard 3.0',url:'https://quaternius.itch.io/universal-animation-library',license:'CC0-1.0',sha256:createHash('sha256').update(bytes).digest('hex')},bones:Object.keys(mapping),clips};
await mkdir('Renderer/motions',{recursive:true});await writeFile('Renderer/motions/authored.json',JSON.stringify(out));console.log(JSON.stringify({bones:out.bones.length,clips:Object.fromEntries(Object.entries(clips).map(([k,c])=>[k,{frames:c.frames,seconds:c.duration}]))}));
