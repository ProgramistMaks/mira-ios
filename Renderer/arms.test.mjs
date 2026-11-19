import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Quaternion, Vector3 } from 'three';
import { ArmRig } from './arms.mjs';
import { REST } from './acting.mjs';
function rig(facing,angled=false) {
  const root=new Object3D(), nodes={};
  for(const [side,sign] of [['left',1],['right',-1]]){
    let parent=root;
    for(const [part,length] of [['UpperArm',.2],['LowerArm',.3],['Hand',.28],['Tip',.12]]){
      const node=new Object3D();node.position.x=sign*length;parent.add(node);
      if(angled&&part==='Hand'){node.position.y=.012;node.position.z=-.018;}
      nodes[side+part]=node;parent=node;
    }
  }
  return {nodes,arms:new ArmRig(name=>nodes[name],facing)};
}
test('palm pronation changes actual hand orientation without moving the elbow or wrist centre',()=>{
  for(const facing of [-1,1])for(const side of ['left','right']){
    const {nodes,arms}=rig(facing,true), pose={...REST,[side+'Lift']:.3,[side+'Elbow']:.9};
    arms.apply(pose);
    const wrist=nodes[side+'Hand'].getWorldPosition(new Vector3());
    const elbow=nodes[side+'LowerArm'].getWorldPosition(new Vector3());
    const rotation=nodes[side+'Hand'].getWorldQuaternion(new Quaternion());
    arms.apply({...pose,[side+'Palm']:1.05});
    assert.ok(wrist.distanceTo(nodes[side+'Hand'].getWorldPosition(new Vector3()))<1e-12);
    assert.ok(elbow.distanceTo(nodes[side+'LowerArm'].getWorldPosition(new Vector3()))<1e-12);
    assert.ok(rotation.angleTo(nodes[side+'Hand'].getWorldQuaternion(new Quaternion()))>1);
  }
});
test('wrist flexion moves the fingertip independently of the arm and resets without drift',()=>{
  for(const facing of [-1,1])for(const side of ['left','right']){
    const {nodes,arms}=rig(facing);arms.apply(REST);
    const wrist=nodes[side+'Hand'].getWorldPosition(new Vector3());
    const tip=nodes[side+'Tip'].getWorldPosition(new Vector3());
    for(let i=0;i<100;i++)arms.apply({...REST,[side+'Flex']:.32,[side+'Wrist']:.14});
    assert.ok(wrist.distanceTo(nodes[side+'Hand'].getWorldPosition(new Vector3()))<1e-12);
    assert.ok(tip.distanceTo(nodes[side+'Tip'].getWorldPosition(new Vector3()))>.03);
    arms.apply(REST);assert.ok(tip.distanceTo(nodes[side+'Tip'].getWorldPosition(new Vector3()))<1e-12);
  }
});
test('arm controls bound invalid values and tolerate incomplete imported rigs',()=>{
  const {nodes,arms}=rig(1);
  arms.apply({...REST,leftPalm:Infinity,rightFlex:NaN,leftWrist:100});
  assert.ok(Object.values(nodes).every(node=>node.quaternion.toArray().every(Number.isFinite)));
  assert.ok(Math.abs(nodes.leftHand.rotation.z)<=.4);
  const partial=new ArmRig(name=>name==='leftHand'?nodes.leftHand:null,1);
  partial.apply({...REST,leftPalm:.9});assert.ok(nodes.leftHand.quaternion.angleTo(new Quaternion())>.8);
});
