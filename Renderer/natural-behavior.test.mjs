import test from 'node:test';
import assert from 'node:assert/strict';
import {NaturalBehavior,followJoint,responseRate} from './natural-behavior.mjs';
import {BodyController,BODY_CHANNELS} from './body.mjs';
import {REST} from './acting.mjs';

test('secondary actions are seeded, separated by pauses, varied and non-repeating',()=>{
  const a=new NaturalBehavior(123),b=new NaturalBehavior(123),events=[],pauses=[];let previous=null,quiet=0;
  for(let i=0;i<60*240;i++){
    const x=a.apply(REST,1/60),y=b.apply(REST,1/60);assert.deepEqual(x,y);
    assert.ok(!('mouth' in x)&&!('mouthAA' in x));
    if(!a.event)quiet++;
    if(a.event&&a.event.start!==previous){events.push(a.event.kind);pauses.push(quiet/60);quiet=0;previous=a.event.start;}
  }
  assert.ok(new Set(events).size>=7);assert.ok(events.every((e,i)=>!i||e!==events[i-1]));
  assert.ok(pauses.slice(1).every(t=>t>1.5));assert.ok(new Set(pauses.map(t=>Math.round(t))).size>=3);
});

test('look shifts lead the head, hidden/manual time does not advance spontaneous state',()=>{
  const a=new NaturalBehavior(52);for(let i=0;i<240;i++)a.apply(REST,1/60);
  const time=a.time,seed=a.seed;for(let i=0;i<600;i++)assert.deepEqual(a.apply(REST,1/60,{active:false}),REST);
  assert.equal(a.time,time);assert.equal(a.seed,seed);
  let eye=0,head=0,ev=0,hv=0;
  for(let i=0;i<6;i++){let e=followJoint(eye,ev,1,1/60,responseRate('eyeYaw'));eye=e.position;ev=e.velocity;let h=followJoint(head,hv,1,1/60,responseRate('headY'));head=h.position;hv=h.velocity;}
  assert.ok(eye>head+.25);
});

test('damped joint trajectories are frame-rate independent with finite velocity and interrupt smoothly',()=>{
  function sample(fps){let p=0,v=0;for(let i=0;i<fps;i++){const s=followJoint(p,v,1,1/fps,16);p=s.position;v=s.velocity;}return [p,v];}
  const expected=sample(30);for(const fps of [60,120,240]){const result=sample(fps);assert.ok(result.every((x,i)=>Math.abs(x-expected[i])<1e-12));}
  const before=followJoint(0,0,1,.05,16),after=followJoint(before.position,before.velocity,-1,0,16);
  assert.ok(Math.abs(after.position-before.position)<1e-12);assert.ok(Math.abs(after.velocity-before.velocity)<1e-12);
});

test('natural behavior respects context, bounded joints and reduced motion after interruptions',()=>{
  const body=new BodyController(44);
  for(const phase of ['idle','listening','thinking','speaking'])for(let i=0;i<1800;i++){
    const p=body.update(REST,1/60,false,{phase});
    for(const c of BODY_CHANNELS)assert.ok(Number.isFinite(p[c.id])&&p[c.id]>=c.min&&p[c.id]<=c.max,c.id);
    assert.ok(p.naturalBlink>=0&&p.naturalBlink<=1);
    if(phase!=='idle')assert.notEqual(body.behavior.event?.kind,'foot');
  }
  const time=body.behavior.time;assert.equal(body.update(REST,1/60,false,{automatic:false}).naturalGaze,undefined);assert.equal(body.behavior.time,time);
  body.update(REST,1/60,false,{directReaction:true});assert.equal(body.behavior.time,time);
  const reduced=body.update(REST,1/60,true);assert.equal(reduced.eyeYaw,0);assert.equal(reduced.hipsSide,0);assert.equal(reduced.naturalGaze,undefined);
});
