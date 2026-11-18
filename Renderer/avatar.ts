import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { motion, SpeechSamples } from './motion.mjs';
import { PerformanceController } from './performance.mjs';
import { ChoreographyRig, CHOREOGRAPHY } from './choreography.mjs';
import { ArmTargets } from './arm-targets.mjs';
import { ArmRig } from './arms.mjs';
import { VARIANT_COUNT } from './expression-library.mjs';
import { PlantedStance } from './stance.mjs';
import { BodyController, ArticulationRig, BODY_CATALOG } from './body.mjs';
import { VitaSecondary } from './vita-secondary.mjs';
import { SecondaryPhysics } from './secondary-physics.mjs';
import { HairDetail } from './hair-detail.mjs';
import { RenderCadence } from './frame-pacer.mjs';
import { AnimationTimeline } from './animation-timeline.mjs';

declare global {
  interface Window {
    webkit?: { messageHandlers: { avatar: { postMessage(value: unknown): void } } };
    companion: { setState(phase: string, reduceMotion: boolean): void;
      setViewport(width: number, height: number): void; setSpeech(level: number, capturedAt: number, sequence: number): void; setFrameRate(fps: number): void; setActive(active: boolean): void; ready: boolean; phase: string;
      renderDisplayFrame(timestamp: number): void; releaseDisplayClock(): void;
      frameStats?: {fps: number; p95ms: number};
      configureChoreography(id: string): void; dance(): void; choreographyCatalog: typeof CHOREOGRAPHY;
      replayGesture(): void; configureBody(settings: Record<string, unknown>): void; bodyCatalog: typeof BODY_CATALOG; bodyStatus: Record<string, unknown>;
      configurePerformance(settings: { emotion?: string; intensity?: number; variant?: number; enabled?: boolean }): void; variantCount: number };
  }
}

const report = (type: string, detail = '') => {
  window.webkit?.messageHandlers.avatar.postMessage({ type, detail });
  document.documentElement.dataset.status = type;
};
const acting = new PerformanceController(crypto.getRandomValues(new Uint32Array(1))[0]);
const body = new BodyController(crypto.getRandomValues(new Uint32Array(1))[0]);
let choreography: ChoreographyRig | undefined;
let choreographyMode = 'auto';
let resetPhysics: (() => void) | undefined;
let frameRate = 120;
let nativeTick: ((timestamp: number) => void) | undefined;
let releaseNativeClock: (() => void) | undefined;
const cadence = new RenderCadence();
function resetCadence() {
  cadence.reset();
  if (window.companion) window.companion.frameStats = undefined;
}
let active = true;
let phase = 'idle';
let reduced = false;
const speechSamples = new SpeechSamples();
const timeline = new AnimationTimeline();
const syncVisibility = () => {
  const visible = active && !document.hidden;
  if (visible !== timeline.active) resetCadence();
  timeline.setActive(visible);
  speechSamples.setActive(visible);
};
document.addEventListener('visibilitychange', syncVisibility);
syncVisibility();
let nativeSize: { width: number; height: number } | undefined;
let applyResize: (() => void) | undefined;
window.companion = {
  ready: false,
  choreographyCatalog: CHOREOGRAPHY,
  renderDisplayFrame(timestamp) { if (Number.isFinite(timestamp) && active && !document.hidden) nativeTick?.(timestamp); },
  releaseDisplayClock() { releaseNativeClock?.(); },
  configureChoreography(id) { choreographyMode = id; choreography?.configure(id); },
  dance() { choreography?.react('dance'); },
  variantCount: VARIANT_COUNT,
  bodyCatalog: BODY_CATALOG, bodyStatus: {},
  configureBody(settings) { body.configure(settings); },
  configurePerformance(settings) { acting.configure(settings); },
  replayGesture() { acting.replay(); choreography?.replay(); },
  phase,
  setActive(value) {
    if (!active && value === true) resetPhysics?.();
    active = value === true;
    syncVisibility();
  },
  setFrameRate(fps) {
    if (Number.isInteger(fps) && fps >= 1 && fps <= 240 && fps !== frameRate) {
      frameRate = fps; resetCadence();
    }
  },
  setSpeech(level, capturedAt, sequence) { speechSamples.receive(level, capturedAt, sequence); },
  setViewport(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    nativeSize = { width, height }; applyResize?.();
  },
  setState(next, reduceMotion) {
    if (!['idle', 'listening', 'thinking', 'speaking'].includes(next)) return;
    if (phase !== next) speechSamples.reset();
    if (reduced !== reduceMotion) resetCadence();
    phase = next; reduced = reduceMotion; window.companion.phase = phase;
    acting.setPhase(phase); acting.update(0, reduced);
  },
};

async function main() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  let contextLost = false;
  // Install before loading: a context can disappear during model decoding too.
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); contextLost = true;
    window.companion.ready = false;
    speechSamples.setActive(false);
    timeline.setActive(false);
    report('error', 'context lost');
  });
  // Rebuild GPU resources and let the native host resend its current state.
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  const key = new THREE.DirectionalLight(0xfff0e4, 1.25);
  key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xe8d7ad, 0.45);
  rim.position.set(-2, 2, -2); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xfff9ee, 0x777a67, 0.85));
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync('character.vrm');
  const avatar = gltf.userData.vrm as VRM | undefined;
  if (!avatar) throw new Error('No VRM avatar');
  VRMUtils.removeUnnecessaryVertices(avatar.scene);
  const details = new VitaSecondary(avatar);
  VRMUtils.rotateVRM0(avatar);
  VRMUtils.combineSkeletons(avatar.scene);
  VRMUtils.combineMorphs(avatar);
  avatar.scene.traverse(object => { object.frustumCulled = false; });
  const authored = new ChoreographyRig(avatar);
  choreography = authored;
  choreography.configure(choreographyMode);
  // Bring the sample's T-pose into a relaxed resting pose.
  const left = avatar.humanoid.getNormalizedBoneNode('leftUpperArm');
  const right = avatar.humanoid.getNormalizedBoneNode('rightUpperArm');
  const armSign = avatar.meta.metaVersion === '0' ? 1 : -1;
  if (left) left.rotation.z = armSign * 1.2;
  if (right) right.rotation.z = -armSign * 1.2;
  // Keep the VRM0 orientation correction; user rotation belongs on a parent node.
  const turntable = new THREE.Group(); turntable.add(avatar.scene); scene.add(turntable);
  avatar.update(0);
  const bounds = new THREE.Box3().setFromObject(avatar.scene);
  const height = bounds.max.y - bounds.min.y;
  const center = bounds.getCenter(new THREE.Vector3());
  const target = new THREE.Object3D(); target.position.set(0, center.y + height * 0.24, 3);
  scene.add(target);
  if (avatar.lookAt) avatar.lookAt.target = target;
  const resize = () => {
    const width = Math.max(1, nativeSize?.width ?? innerWidth);
    const viewportHeight = Math.max(1, nativeSize?.height ?? innerHeight);
    renderer.setSize(width, viewportHeight);
    camera.aspect = width / viewportHeight;
    const distance = height * 0.54 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, center.y + height * 0.03, distance * Math.max(1, 0.65 / camera.aspect));
    camera.lookAt(0, center.y, 0); camera.updateProjectionMatrix();
  };
  applyResize = resize; resize(); addEventListener('resize', resize);
  let rotation = 0;
  let pointer: { id: number; x: number; startX: number; startY: number; moved: boolean } | undefined;
  const ray = new THREE.Raycaster();
  const hitCharacter = (event: PointerEvent) => {
    const box = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1,
      -(event.clientY - box.top) / box.height * 2 + 1), camera);
    // Bounds must match the current animated pose, not a cached T-pose.
    avatar.scene.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) object.computeBoundingSphere();
    });
    return ray.intersectObject(avatar.scene, true).some(hit => hit.object.visible);
  };
  renderer.domElement.addEventListener('pointerdown', event => {
    if (pointer || !event.isPrimary) return;
    pointer = { id: event.pointerId, x: event.clientX, startX: event.clientX, startY: event.clientY, moved: false };
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 8) pointer.moved = true;
    if (!reduced) rotation = THREE.MathUtils.clamp(rotation + (event.clientX - pointer.x) * 0.006, -0.65, 0.65);
    pointer.x = event.clientX;
  });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const tap = !pointer.moved;
    pointer = undefined;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    if (tap && active && hitCharacter(event) && !reduced) {
      acting.trigger('touch'); authored.react('touch'); details.listenCue();
    }
  });
  renderer.domElement.addEventListener('pointercancel', () => { pointer = undefined; });
  renderer.domElement.addEventListener('lostpointercapture', () => { pointer = undefined; });
  const bone = (name: Parameters<typeof avatar.humanoid.getNormalizedBoneNode>[0]) => avatar.humanoid.getNormalizedBoneNode(name);
  const stance = new PlantedStance(avatar.scene, bone, height, avatar.meta.metaVersion === '0' ? -1 : 1);
  const head = bone('head'), neck = bone('neck'), spine = bone('spine'), chest = bone('chest');
  const arms = new ArmRig(bone, armSign);
  const armTargets = new ArmTargets(avatar.scene, bone, height, armSign);
  const articulation = new ArticulationRig(bone, armSign);
  const secondary = new SecondaryPhysics(avatar.springBoneManager);
  resetPhysics = () => {secondary.reset(); details.rebase();};
  const detail = new HairDetail(avatar.scene);
  const bodyStatus = () => {
    window.companion.bodyStatus = { joints: articulation.entries.length, physics: secondary.counts,
      triangles: detail.triangles, hairDetailAvailable: detail.available, detail: detail.mode, error: detail.error,
      coccyx: false, cloth: 'spring-bones' };
  };
  bodyStatus();
  // VRM0 may keep surprise as a custom name; imported rigs may omit it.
  const expressionName = (names: string[]) => names.find(name => avatar.expressionManager?.getExpression(name));
  const expressiveChannels = [
    ['angry', expressionName(['angry'])], ['sad', expressionName(['sad'])],
    ['relaxed', expressionName(['relaxed'])], ['surprise', expressionName(['surprised', 'Surprised'])],
  ] as const;
  // Pose the raw skeleton before resetting spring history. No first-frame
  // explosion from simulating a T-pose -> standing jump.
  authored.bind(stance, armTargets, articulation);
  authored.enabled = true; authored.renderPose();
  avatar.update(0); secondary.reset();
  for (let i = 0; i < 12; i++) avatar.update(1 / 120);
  let displayedVariant = -1;
  let mouth = 0, elapsed = 0;
  let previousPhase = phase;
  acting.update(0, reduced); acting.trigger('greeting'); authored.react('greeting'); details.listenCue();
  const renderFrame = (timestamp: number) => {
    // A cap is a target, not a claim about measured device performance.
    const cap = reduced ? Math.min(frameRate, 30) : frameRate;
    if (contextLost || renderer.getContext().isContextLost()) return;
    const delta = timeline.advance(timestamp, cap);
    if (delta === null) return;
    elapsed += delta;
    const audioLevel = speechSamples.level();
    const useAuthored = body.mode === 'natural' && acting.settings.variant < 0;
    const pose = body.update(acting.update(delta, reduced, audioLevel), delta, reduced, {phase, automatic:!useAuthored && acting.settings.variant < 0 && acting.settings.enabled, directReaction:['greeting','touch'].includes(acting.clip)});
    if (detail.mode !== body.detail) { detail.set(body.detail); bodyStatus(); }
    secondary.configure(body, reduced);
    const motionID = reduced ? 'reduced' : acting.clip;
    if (document.documentElement.dataset.motion !== motionID) document.documentElement.dataset.motion = motionID;
    if (displayedVariant !== acting.variant) {
      displayedVariant = acting.variant;
      document.documentElement.dataset.variation = String(displayedVariant);
    }
    const face = motion(elapsed, phase, reduced, audioLevel);
    turntable.rotation.y = THREE.MathUtils.damp(turntable.rotation.y, rotation, 6, delta);
    if (!useAuthored) {
      authored.enabled = false;
      stance.apply(pose);
      arms.apply(pose);
      articulation.apply(pose);
      if (spine) spine.rotation.set(pose.spineX, pose.spineY, pose.spineZ);
      if (chest) chest.rotation.set(pose.chestX, pose.chestY, pose.chestZ);
      if (neck) neck.rotation.set(pose.neckX, pose.neckY, pose.neckZ);
      if (head) head.rotation.set(pose.headX, pose.headY, pose.headZ);
      armTargets.apply(pose);
    } else authored.update(delta, {phase, audio: audioLevel, reduced: reduced || !acting.settings.enabled});
    window.companion.bodyStatus.behavior = useAuthored ? authored.title : body.behaviorLabel;
    window.companion.bodyStatus.choreography = {clip: authored.clip, mode: authored.mode, enabled: authored.enabled};
    target.position.set(pose.gazeX * height, center.y + height * (0.24 + pose.gazeY), 3);
    const faceTest = !reduced && ['face', 'manual'].includes(body.mode);
    if (avatar.lookAt) {
      avatar.lookAt.autoUpdate = !(faceTest || pose.naturalGaze);
      if (faceTest || pose.naturalGaze) { avatar.lookAt.yaw = pose.eyeYaw; avatar.lookAt.pitch = pose.eyePitch; }
    }
    avatar.expressionManager?.setValue('blink', faceTest ? 0 : pose.naturalGaze ? pose.naturalBlink : face.blink);
    avatar.expressionManager?.setValue('blinkLeft', faceTest ? pose.blinkLeft : 0);
    avatar.expressionManager?.setValue('blinkRight', faceTest ? pose.blinkRight : 0);
    mouth = phase === 'speaking' ? THREE.MathUtils.damp(mouth, face.mouth, 28, delta) : 0;
    avatar.expressionManager?.setValue('aa', phase === 'speaking' ? mouth : faceTest ? pose.mouthAA : 0);
    for (const [name, key] of [['ih','mouthIH'],['ou','mouthOU'],['ee','mouthEE'],['oh','mouthOH']]) {
      avatar.expressionManager?.setValue(name, faceTest && phase !== 'speaking' ? pose[key] : 0);
    }
    avatar.expressionManager?.setValue('happy', pose.smile);
    for (const [channel, name] of expressiveChannels) if (name) avatar.expressionManager?.setValue(name, pose[channel]);
    const natural = useAuthored && acting.settings.enabled && !reduced;
    if (natural && phase === 'listening' && phase !== previousPhase) details.listenCue();
    previousPhase = phase;
    details.update(delta, phase, natural ? authored.inhale : 0, natural && body.physics);
    avatar.update(delta);
    renderer.render(scene, camera);
    const sample = cadence.sample(performance.now());
    if (sample) {
      window.companion.frameStats = sample;
      window.webkit?.messageHandlers.avatar.postMessage({type:'cadence', fps:String(sample.fps), p95:String(sample.p95ms)});
    }
    if (!window.companion.ready) { window.companion.ready = true; report('ready'); }
  };
  let nativeClock = false;
  nativeTick = timestamp => {
    if (!nativeClock) {
      nativeClock = true;
      renderer.setAnimationLoop(null);
      timeline.resetClock(); resetCadence();
    }
    renderFrame(timestamp);
  };
  releaseNativeClock = () => {
    if (!nativeClock) return;
    nativeClock = false;
    timeline.resetClock(); resetCadence();
    renderer.setAnimationLoop(renderFrame);
  };
  renderer.setAnimationLoop(renderFrame);
}

main().catch(error => {
  report('error', String(error));
  const message = document.createElement('p'); message.id = 'error';
  message.textContent = 'Персонаж не загрузился'; document.body.appendChild(message);
});
