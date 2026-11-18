// Convert the permitted, extracted Nayu motion files into model-independent tracks.
// Usage: node Scripts/import-nayu-motion.mjs /path/to/extracted-nayu-pack
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const root = process.argv[2];
if (!root) throw Error('Provide the extracted Nayu motion directory');
const { clips } = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const fbxBones = { hips:'Hips', spine:'Spine', chest:'Chest', upperChest:'Upper_Chest', neck:'Neck', head:'Head' };
const mixamoBones = { hips:'mixamorigHips', spine:'mixamorigSpine', chest:'mixamorigSpine1', upperChest:'mixamorigSpine2', neck:'mixamorigNeck', head:'mixamorigHead' };
const glbBones = { hips:'pelvis', spine:'spine_01', chest:'spine_02', upperChest:'spine_03', neck:'neck_01', head:'Head' };
for (const [side, suffix] of [['left', 'L'], ['right', 'R']]) {
  for (const [bone, fbx, glb] of [
    ['Shoulder','Shoulder','clavicle'], ['UpperArm','Upper_Arm','upperarm'], ['LowerArm','Lower_Arm','lowerarm'],
    ['Hand','Hand','hand'], ['UpperLeg','Upper_Leg','thigh'], ['LowerLeg','Lower_Leg','calf'],
    ['Foot','Foot','foot'], ['Toes','Toes','ball'],
  ]) {
    fbxBones[side+bone] = fbx+'_'+suffix;
    glbBones[side+bone] = glb+'_'+suffix.toLowerCase();
    const mix = {UpperArm:'Arm',LowerArm:'ForeArm',UpperLeg:'UpLeg',LowerLeg:'Leg',Toes:'ToeBase'}[bone] || bone;
    mixamoBones[side+bone] = 'mixamorig'+(suffix==='L'?'Left':'Right')+mix;
  }
  for (const [finger, glb] of [['Thumb','thumb'],['Index','index'],['Middle','middle'],['Ring','ring'],['Little','pinky']]) {
    const joints = finger==='Thumb' ? ['Metacarpal','Proximal','Distal'] : ['Proximal','Intermediate','Distal'];
    for (const [i, joint] of joints.entries()) {
      const fbxJoint = i===2 ? 'Distal' : i===1 ? 'Intermediate' : 'Proximal';
      fbxBones[side+finger+joint] = finger+'_'+fbxJoint+'_'+suffix;
      glbBones[side+finger+joint] = glb+'_0'+(i+1)+'_'+suffix.toLowerCase();
      mixamoBones[side+finger+joint] = 'mixamorig'+(suffix==='L'?'Left':'Right')+'Hand'+(finger==='Little'?'Pinky':finger)+(i+1);
    }
  }
}

const nativeBones = Object.fromEntries(Object.entries(fbxBones).map(([bone,name])=>[bone,name.replace(/_([LR])$/, '$1')]));
Object.assign(nativeBones,{upperChest:'Chest',leftFoot:'FootL001',rightFoot:'FootR001',leftToes:'FootL002',rightToes:'FootR002'});
const bones = Object.keys(fbxBones);
const stride = 16 + 20*bones.length;
const index = { version: 1, bones, clips: {} };
const buffers = [];
let offset = 0;
const identity = new Quaternion();
const up = new Quaternion().setFromAxisAngle(new Vector3(1,0,0), -Math.PI/2);
const sourceFiles = new Map();
for (const clip of clips) {
  if (!/^clips\/[a-z0-9_]+\.(fbx|glb)$/.test(clip.file) || !/^[a-z0-9_]+$/.test(clip.name))
    throw Error('Invalid animation reference: ' + clip.name);
  if (!sourceFiles.has(clip.file)) {
    const bytes = await readFile(path.join(root, clip.file));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength);
    const fbx = clip.file.endsWith('.fbx');
    const parsed = fbx ? new FBXLoader().parse(buffer, '') : await new GLTFLoader().parseAsync(buffer, '');
    const scene = fbx ? parsed : parsed.scene;
    const rig = !fbx ? glbBones : scene.getObjectByName('mixamorigHips') ? mixamoBones :
      scene.getObjectByName('Upper_ArmL') ? nativeBones : fbxBones;
    const nodes = bones.map(name=>scene.getObjectByName(rig[name]));
    if (nodes.some(n=>!n)) throw Error('Incomplete rig in ' + clip.file);
    const basis = rig===fbxBones ? up : identity;
    scene.updateMatrixWorld(true);
    const origin = nodes[0].getWorldPosition(new Vector3()).applyQuaternion(basis);
    sourceFiles.set(clip.file, {
      scene, clips:parsed.animations, nodes, basis, origin, unit:origin.y>10 ? .01 : 1,
      rest:nodes.map(n=>n.getWorldQuaternion(new Quaternion()).invert()),
      local:nodes.map(n=>n.position.clone()),
      parent:nodes.map(n=>n.parent.getWorldQuaternion(new Quaternion())),
      hash:createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const { scene, clips: takes, nodes, basis, origin, unit, rest, local, parent, hash } = sourceFiles.get(clip.file);
  const take = clip.source ? takes.find(t=>t.name===clip.source) : takes[0];
  if (!take) throw Error('Missing source take for ' + clip.name);
  const translated = new Set(take.tracks.filter(track=>track.name.endsWith('.position') &&
    track.values.some((value,i)=>Math.abs(value-track.values[i%3])>origin.y*1e-5))
    .map(track=>track.name.slice(0,-9)));
  const times = [...new Set([0, take.duration, ...take.tracks.flatMap(track=>Array.from(track.times))])].sort((a,b)=>a-b);
  const frames = Buffer.alloc(stride*times.length);
  const mixer = new AnimationMixer(scene);
  const action = mixer.clipAction(take).setLoop(LoopOnce,1);
  action.clampWhenFinished = true;
  action.play();
  const position = new Vector3();
  const rotation = new Quaternion();
  const previous = bones.map(()=>new Quaternion());
  const basisInverse = basis.clone().invert();
  const translation = new Vector3().fromArray(clip.offset || [0,0,0]).divideScalar(origin.y*unit);
  for (const [frame,time] of times.entries()) {
    mixer.setTime(time);
    scene.updateMatrixWorld(true);
    const start = frame*stride;
    frames.writeFloatLE(time,start);
    nodes[0].getWorldPosition(position).applyQuaternion(basis).sub(origin).divideScalar(origin.y).add(translation);
    for (const [i,axis] of ['x','y','z'].entries()) frames.writeFloatLE(position[axis],start+4+4*i);
    for (const [i,node] of nodes.entries()) {
      node.getWorldQuaternion(rotation).multiply(rest[i]).premultiply(basis).multiply(basisInverse).normalize();
      if (frame && rotation.dot(previous[i])<0) rotation.set(-rotation.x,-rotation.y,-rotation.z,-rotation.w);
      previous[i].copy(rotation);
      for (const [j,axis] of ['x','y','z','w'].entries())
        frames.writeInt16LE(Math.round(rotation[axis]*32767),start+16+20*i+2*j);
      if (i && translated.has(node.name)) {
        position.copy(node.position).sub(local[i]).applyQuaternion(parent[i]).applyQuaternion(basis).divideScalar(origin.y);
        for (const [j,axis] of ['x','y','z'].entries())
          frames.writeFloatLE(position[axis],start+24+20*i+4*j);
      }
    }
  }
  mixer.stopAllAction();
  index.clips[clip.name] = {
    offset, frames:times.length, duration:take.duration,
    loop:clip.loop===true, speed:clip.speed||1, fade:clip.fade??.4,
    source:clip.file, take:take.name, sha256:hash,
  };
  offset += frames.length;
  buffers.push(frames);
}
await writeFile('Renderer/motions/nayu.json',JSON.stringify(index));
await writeFile('Renderer/motions/nayu-motion.bin',Buffer.concat(buffers));
console.log(Object.keys(index.clips).length + ' original clips, ' + bones.length + ' humanoid joints, ' + offset + ' bytes');
