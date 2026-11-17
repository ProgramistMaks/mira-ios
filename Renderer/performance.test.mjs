import test from 'node:test';
import assert from 'node:assert/strict';
import { REST } from './acting.mjs';
import { GESTURES, EMOTIONS, GAZES, STANCES, VARIANT_COUNT, POSE_KEYS, encodeVariant, decodeVariant, sampleVariant } from './expression-library.mjs';
import { PerformanceController } from './performance.mjs';
import { SpeechEmphasis, humanizePose } from './human-motion.mjs';
const advance=(actor,seconds,rate=60,reduced=false)=>{for(let i=0;i<Math.round(seconds*rate);i++)actor.update(1/rate,reduced);};
const difference=(a,b)=>Math.max(...POSE_KEYS.map(k=>Math.abs(a[k]-b[k])));

test('catalogue contains over 10,000 distinct sampled motion/face trajectories, not duplicate IDs',()=>{
  assert.equal(VARIANT_COUNT,29952);
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
    assert.ok(Math.abs(pose.leftPalm)<=1.2&&Math.abs(pose.rightPalm)<=1.2);
    assert.ok(Math.abs(pose.leftFlex)<=.45&&Math.abs(pose.rightFlex)<=.45);
    assert.ok(Math.abs(pose.hipsSide)<=.025&&pose.hipsDrop<=.025);
    assert.ok(pose.smile+pose.angry+pose.sad+pose.relaxed+pose.surprise<=.8500000001);
    assert.ok(!('mouth' in pose),'Emotions cannot synthesize speech amplitude');
  }
  assert.equal(decodeVariant(-1),null);assert.equal(decodeVariant(VARIANT_COUNT),null);
  assert.equal(encodeVariant(52,0,0,0),-1);
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
  assert.equal(GESTURES.length,52);assert.equal(EMOTIONS.length,12);assert.equal(GAZES.length,8);assert.equal(STANCES.length,6);
  const actor=new PerformanceController(12);actor.configure({variant:13799});advance(actor,60);
  assert.equal(actor.variant,13799);
  actor.setPhase('listening');assert.equal(actor.variant,13799);
});

test('saved first-generation IDs retain all four selections and manual-only gestures stay out of automatic conversation',()=>{
  assert.equal(encodeVariant(23,11,7,5),13823);
  assert.deepEqual(decodeVariant(13799),{gesture:23,emotion:11,gaze:3,stance:5});
  assert.equal(GESTURES[23].id,'settle');
  for(const id of ['gentle-stop','soft-disagree','small-celebration'])
    assert.deepEqual(GESTURES.find(g=>g.id===id).phases,[]);
});
test('automatic selection excludes the last four gestures, not just combination IDs; mood persists across phrases',()=>{
  const actor=new PerformanceController(99);
  for(const phase of ['idle','listening','thinking','speaking']){
    actor.setPhase(phase);
    for(let i=0;i<100;i++){
      const recent=[...actor.gestureHistory], emotion=actor.autoEmotion, remaining=actor.moodTurns;
      actor.choose();
      assert.ok(!recent.includes(decodeVariant(actor.variant).gesture));
      if(remaining>0)assert.equal(actor.autoEmotion,emotion);
      assert.ok(actor.gestureHistory.length<=4);
    }
  }
});
test('every new phrase prepares, holds and releases with no endpoint jump; interpolation stays bounded',()=>{
  for(let gesture=24;gesture<GESTURES.length;gesture++){
    const frames=GESTURES[gesture].frames;
    assert.deepEqual(frames[0],[0,{}]);assert.deepEqual(frames.at(-1),[1,{}]);
    assert.ok(frames.every(([t],i)=>i===0||t>frames[i-1][0]));
    const id=encodeVariant(gesture,0,0,0);
    assert.ok(difference(sampleVariant(id,0),sampleVariant(id,.0001))<1e-8);
    assert.ok(difference(sampleVariant(id,1),sampleVariant(id,.9999))<1e-8);
    let previous=sampleVariant(id,0);
    for(let i=1;i<=600;i++){
      const current=sampleVariant(id,i/600);
      assert.ok(difference(previous,current)<.05,`${GESTURES[gesture].id}: discontinuity`);
      previous=current;
    }
  }
});
test('a selected arm track replaces competing base movement during its stroke',()=>{
  const id=encodeVariant(26,0,0,0);
  const quiet=sampleVariant(id,.34,REST,1);
  const busy=sampleVariant(id,.34,{...REST,rightLift:1.2,rightElbow:2.4,rightForward:1},1);
  for(const key of ['rightLift','rightElbow','rightForward'])assert.equal(quiet[key],busy[key]);
  assert.equal(sampleVariant(id,0,{...REST,rightLift:.8}).rightLift,.8);
});
test('speech accents require actual audio onsets, have a refractory interval and clear outside speaking',()=>{
  const accent=new SpeechEmphasis();
  for(let i=0;i<120;i++)assert.equal(accent.update(1/60,0,true).beat,0);
  accent.update(1/60,.8,true);
  let peak=0;
  for(let i=0;i<20;i++)peak=Math.max(peak,accent.update(1/60,.8,true).beat);
  assert.ok(peak>.95);
  for(let i=0;i<100;i++)accent.update(1/60,.8,true);
  assert.equal(accent.update(1/60,.8,true).beat,0,'Sustained sound must not create metronomic nods');
  assert.deepEqual(accent.update(1/60,.8,false),{energy:0,beat:0});
  for(const level of [NaN,Infinity,-3])assert.deepEqual(accent.update(1/60,level,true),{energy:0,beat:0});
});
test('secondary motion is small, preserves manual gaze and does not author facial or mouth amplitude',()=>{
  const pose=sampleVariant(0,.3), base={...pose};
  for(let t=0;t<60;t+=.1){
    const next=humanizePose(pose,t,1,'idle',{energy:0,beat:0},false);
    assert.ok(difference(next,pose)<.008);
    assert.equal(next.gazeX,pose.gazeX);assert.equal(next.gazeY,pose.gazeY);
    assert.equal(next.smile,pose.smile);assert.ok(!('mouth' in next));
  }
  assert.deepEqual(pose,base);
  const quiet=new PerformanceController(2), audible=new PerformanceController(2);
  for(const actor of [quiet,audible]){actor.configure({variant:encodeVariant(26,0,0,0)});actor.setPhase('speaking');}
  for(let i=0;i<120;i++){quiet.update(1/60,false,0);audible.update(1/60,false,.7);}
  assert.ok(audible.pose.rightLift>quiet.pose.rightLift+.1);
  for(let i=0;i<60;i++)audible.update(1/60,true,.7);
  for(const key of Object.keys(REST).filter(k=>k!=='smile'))assert.equal(audible.pose[key],REST[key]);
});
test('greeting and touch release into gesture preparation without a mid-stroke jump',()=>{
  const actor=new PerformanceController(123);
  actor.configure({variant:encodeVariant(28,1,0,0),intensity:1});
  for(const kind of ['greeting','touch']){
    assert.equal(actor.trigger(kind),true);
    let ended=false;
    for(let i=0;i<720;i++){
      const wasDirect=actor.directReaction, previous={...actor.pose};
      actor.update(1/120);
      assert.ok(difference(previous,actor.pose)<.075);
      if(wasDirect&&!actor.directReaction){assert.equal(actor.age,0);ended=true;}
    }
    assert.ok(ended);
  }
});
