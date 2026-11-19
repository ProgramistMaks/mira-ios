import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Vector3, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import { BodyController, ArticulationRig, BODY_CHANNELS } from './body.mjs';
import { SecondaryPhysics } from './secondary-physics.mjs';
import { subdivideSkin } from './hair-detail.mjs';
import { REST } from './acting.mjs';

test('30 phalanges have independent controls, bounded input and smooth reset',()=>{
  const c=new BodyController();c.configure({mode:'manual',controls:{leftIndex1:99,rightThumb2:.6,headY:NaN,leftKnee:Infinity,unexpected:2}});
  assert.equal(Object.keys(c.controls).length,2);assert.equal(c.controls.leftIndex1,1.35);
  const first=c.update(REST,1/60);assert.ok(first.leftIndex1<.5);
  let p;for(let i=0;i<180;i++)p=c.update(REST,1/60);
  assert.ok(Math.abs(p.leftIndex1-1.35)<1e-8);assert.ok(Math.abs(p.leftMiddle1-.144)<1e-8);
  assert.ok(Math.abs(p.rightThumb2-.6)<1e-8);
  c.configure({mode:'natural',controls:{}});const next=c.update(REST,1/120);assert.ok(next.leftIndex1>.9);
  const reduced=c.update(REST,1/60,true);assert.equal(reduced.leftIndex1,.144);assert.equal(reduced.headY,0);
});

test('all demonstration modes remain finite and bounded through long playback',()=>{
  const c=new BodyController();
  for(const mode of ['natural','hands','mobility','legs','face','manual']){
    c.configure({mode});for(let i=0;i<1800;i++){const p=c.update(REST,1/60);for(const channel of BODY_CHANNELS)assert.ok(Number.isFinite(p[channel.id])&&p[channel.id]>=channel.min-1e-8&&p[channel.id]<=channel.max+1e-8,channel.id);}
  }
  c.configure(null);c.configure({mode:'unknown',wind:Infinity});assert.equal(c.mode,'manual');
});

test('joint transforms do not accumulate or alter sibling fingers and accept incomplete rigs',()=>{
  const root=new Object3D(),names=['leftThumbMetacarpal','leftThumbProximal','leftThumbDistal','leftIndexProximal','leftMiddleProximal'],nodes={};
  for(const name of names){const n=new Object3D();root.add(n);n.rotation.x=.1;nodes[name]=n;}
  const rig=new ArticulationRig(name=>nodes[name]);
  const rest=nodes.leftMiddleProximal.quaternion.clone();
  const p={leftIndex0:1,leftThumb0:.4,leftThumbOpposition:.4};rig.apply(p);
  const q=nodes.leftIndexProximal.quaternion.clone();
  for(let i=0;i<1000;i++)rig.apply(p);
  assert.ok(nodes.leftIndexProximal.quaternion.angleTo(q)<1e-7);
  assert.ok(nodes.leftMiddleProximal.quaternion.angleTo(rest)<1e-7);
  assert.ok(nodes.leftThumbMetacarpal.quaternion.angleTo(rest)>.4);
});

function springFixture(){
  const steps=[],colliders=[{}],joint={bone:{name:'HairJoint-1'},settings:{stiffness:.5,dragForce:.4,gravityPower:0,gravityDir:new Vector3(0,-1,0)},colliderGroups:colliders};
  const m={joints:new Set([joint]),resetCount:0,reset(){this.resetCount++;},update(dt){steps.push(dt);}};
  return {m,steps,joint,colliders,physics:new SecondaryPhysics(m)};
}
test('spring simulation uses 120 Hz steps at 30/60/120/240 rendering and keeps authored collisions',()=>{
  for(const fps of [30,60,120,240]){
    const {m,steps,joint,colliders,physics}=springFixture();physics.configure({physics:true,wind:1,softness:.8});
    for(let i=0;i<fps*3;i++)m.update(1/fps);
    assert.equal(steps.length,360);assert.ok(steps.every(dt=>dt===1/120));assert.equal(joint.colliderGroups,colliders);
    assert.ok(joint.settings.gravityPower>0);assert.ok(Math.abs(joint.settings.gravityDir.length()-1)<1e-8);
    const count=steps.length;physics.configure({physics:false});m.update(1/60);m.update(1/60);assert.equal(steps.length,count);assert.equal(m.resetCount,1);
    physics.configure({physics:true},true);m.update(.05);assert.equal(steps.length,count);
    physics.configure({physics:true});m.update(10);assert.equal(steps.length,count+6);assert.equal(m.resetCount,2);
  }
});

test('hair subdivision preserves boundaries/UV and normalizes interpolated skin weights',()=>{
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setAttribute('normal',new Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
  g.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,0,1],2));g.setAttribute('skinIndex',new Uint16BufferAttribute([0,0,0,0,1,0,0,0,2,0,0,0],4));g.setAttribute('skinWeight',new Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));g.setIndex([0,1,2]);g.addGroup(0,3,2);
  const high=subdivideSkin(g);assert.equal(high.index.count,12);assert.equal(high.attributes.position.count,6);assert.deepEqual(high.groups,[{start:0,count:12,materialIndex:2}]);
  for(let i=0;i<6;i++){const w=high.attributes.skinWeight;assert.equal(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i),1);}
  assert.deepEqual(Array.from(high.attributes.position.array.slice(0,9)),Array.from(g.attributes.position.array));
  assert.deepEqual(Array.from(high.attributes.uv.array.slice(6,8)),[.5,0]);
  g.morphAttributes.position=[g.attributes.position.clone()];assert.equal(subdivideSkin(g),null);
});
