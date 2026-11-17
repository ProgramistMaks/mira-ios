import test from 'node:test';
import assert from 'node:assert/strict';
import {Object3D,Quaternion,Vector3} from 'three';
import {ArmTargets} from './arm-targets.mjs';
import {ArmRig} from './arms.mjs';
import {REST} from './acting.mjs';
function make(sign){
 const root=new Object3D(),nodes={};
 const add=(name,parent,x,y,z=0)=>{const n=new Object3D();n.position.set(x,y,z);parent.add(n);nodes[name]=n;return n;};
 const chest=add('chest',root,0,1.2),neck=add('neck',chest,0,.22);
 for(const side of ['left','right']){const s=side==='left'?-sign:sign;const upper=add(side+'UpperArm',chest,s*.1,.16),lower=add(side+'LowerArm',upper,s*.22,0),hand=add(side+'Hand',lower,s*.21,0);for(const [f,z]of [['Index',-.015],['Middle',0],['Little',.015]])add(side+f+'Proximal',hand,s*.055,0,z);}
 const bone=n=>nodes[n];return {root,nodes,targets:new ArmTargets(root,bone,1.8,sign),arms:new ArmRig(bone,sign)};
}
test('chest and wave reach both conventions with fixed lengths and bounded wrist bends',()=>{
 for(const sign of [-1,1])for(const side of ['left','right'])for(const target of ['ChestReach','WaveReach']){
  const {root,nodes,targets,arms}=make(sign);root.position.set(2,1,-3);root.rotation.y=.6;
  const pose={...REST,[side+target]:1};arms.apply(pose);targets.apply(pose);
  const entry=targets.arms.find(a=>a.side===side);
  assert.ok(entry.hand.getWorldPosition(new Vector3()).distanceTo(entry.goal)<1e-6);
  assert.ok(entry.hand.quaternion.angleTo(new Quaternion())<=.600001);
  assert.equal(nodes[side+'LowerArm'].position.length(),.22);assert.equal(nodes[side+'Hand'].position.length(),.21);
 }
});
test('zero and invalid reach leave FK unchanged, incomplete imported rigs remain usable',()=>{
 const {root,nodes,targets,arms}=make(1);arms.apply(REST);const q=nodes.leftUpperArm.quaternion.clone();
 targets.apply({...REST,leftChestReach:NaN,rightWaveReach:Infinity});assert.ok(q.angleTo(nodes.leftUpperArm.quaternion)<1e-8);
 new ArmTargets(root,()=>null,1.8).apply({leftChestReach:1});
});
