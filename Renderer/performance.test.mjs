import test from 'node:test';
import assert from 'node:assert/strict';
import { REST } from './acting.mjs';
import { GESTURES, EMOTIONS, GAZES, STANCES, VARIANT_COUNT, POSE_KEYS, encodeVariant, decodeVariant, sampleVariant } from './expression-library.mjs';
import { PerformanceController } from './performance.mjs';
const advance=(actor,seconds,rate=60,reduced=false)=>{for(let i=0;i<Math.round(seconds*rate);i++)actor.update(1/rate,reduced);};
const difference=(a,b)=>Math.max(...POSE_KEYS.map(k=>Math.abs(a[k]-b[k])));

test('catalogue contains over 10,000 distinct sampled motion/face trajectories, not duplicate IDs',()=>{
  assert.equal(VARIANT_COUNT,13824);
  const signatures=new Set();
  for(let id=0;id<VARIANT_COUNT;id++){
    const d=decodeVariant(id);
    assert.equal(encodeVariant(d.gesture,d.emotion,d.gaze,d.stance),id);
    // 1e-5 quantization excludes floating-point noise from the uniqueness count.
    const signature=[.22,.43,.64].flatMap(t=>{const pose=sampleVariant(id,t);return POSE_KEYS.map(k=>Math.round(pose[k]*100000));}).join(',');
    signatures.add(signature);
  }
  assert.equal(signatures.size,VARIANT_COUNT);
});
test('every combination remains finite and inside grounded joint/face limits',()=>{
  for(let id=0;id<VARIANT_COUNT;id++)for(const t of [0,.22,.43,.84,1]){
    const pose=sampleVariant(id,t,REST,1);
    assert.ok(Object.values(pose).every(Number.isFinite));
    assert.ok(pose.leftLift<=1.38&&pose.rightLift<=1.38);
    assert.ok(pose.leftElbow<=2.6&&pose.rightElbow<=2.6);
    assert.ok(Math.abs(pose.hipsSide)<=.025&&pose.hipsDrop<=.025);
    assert.ok(pose.smile+pose.angry+pose.sad+pose.relaxed+pose.surprise<=.8500000001);
    assert.ok(!('mouth' in pose),'Emotions cannot synthesize speech amplitude');
  }
  assert.equal(decodeVariant(-1),null);assert.equal(decodeVariant(VARIANT_COUNT),null);
  assert.equal(encodeVariant(24,0,0,0),-1);
});
test('automatic choices respect the conversation, avoid recent repeats and have bounded memory',()=>{
  const actor=new PerformanceController(123);
  for(const phase of ['idle','listening','thinking','speaking']){
    actor.setPhase(phase);
    for(let n=0;n<200;n++){
      const recent=[...actor.history];actor.choose();const d=decodeVariant(actor.variant);
      assert.ok(GESTURES[d.gesture].phases.includes(phase));
      assert.ok(!['sad','serious','surprised'].includes(EMOTIONS[d.emotion].id));
      assert.ok(!recent.includes(actor.variant));assert.ok(actor.history.length<=64);
    }
  }
});
test('interruptions and configuration changes blend from the last displayed full pose',()=>{
  const actor=new PerformanceController(12);advance(actor,1);
  for(const phase of ['speaking','thinking','listening','idle']){
    const before={...actor.pose};actor.setPhase(phase);assert.ok(difference(before,actor.update(0))<1e-12);advance(actor,.3);
  }
  const before={...actor.pose};actor.configure({variant:VARIANT_COUNT-1,intensity:1});
  assert.ok(difference(before,actor.update(0))<1e-12);
  for(let i=0;i<60;i++){const prev={...actor.pose};actor.update(1/120);assert.ok(difference(prev,actor.pose)<.08);}
});
test('reduced motion freezes body and additional gestures; disabling variety retains legacy animation',()=>{
  const actor=new PerformanceController(12);actor.setPhase('speaking');advance(actor,2);
  advance(actor,1,60,true);const pose={...actor.pose};
  for(const key of Object.keys(REST).filter(k=>k!=='smile'))assert.equal(pose[key],REST[key]);
  advance(actor,15,60,true);assert.deepEqual(actor.pose,pose);assert.equal(actor.trigger('touch'),false);
  actor.configure({enabled:false});advance(actor,1);assert.equal(actor.pose.angry,0);assert.equal(actor.pose.sad,0);
});
test('same seeded motion is independent of 30/60/120/240 Hz, rejects invalid clocks/configuration',()=>{
  const expected=new PerformanceController(123);expected.setPhase('speaking');advance(expected,3,30);
  for(const rate of [60,120,240]){const actor=new PerformanceController(123);actor.setPhase('speaking');advance(actor,3,rate);assert.ok(difference(actor.pose,expected.pose)<1e-9);}
  const before=expected.age;for(const value of [NaN,Infinity,-100])expected.update(value);assert.equal(expected.age,before);
  expected.configure({variant:Infinity,emotion:"bad'code",intensity:NaN});assert.equal(expected.settings.variant,-1);assert.equal(expected.settings.emotion,'auto');
  expected.configure(null);assert.ok(Object.values(expected.update(0)).every(Number.isFinite));
});
test('all catalogue dimensions alter rendered inputs and manual choice survives idle cycle rollover',()=>{
  assert.equal(GESTURES.length,24);assert.equal(EMOTIONS.length,12);assert.equal(GAZES.length,8);assert.equal(STANCES.length,6);
  const actor=new PerformanceController(12);actor.configure({variant:13799});advance(actor,60);
  assert.equal(actor.variant,13799);
  actor.setPhase('listening');assert.equal(actor.variant,13799);
});
