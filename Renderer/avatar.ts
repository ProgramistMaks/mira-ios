import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { motion, SpeechSamples } from './motion.mjs';
import { ActingController } from './acting.mjs';
import { PlantedStance } from './stance.mjs';
import { AnimationTimeline } from './animation-timeline.mjs';

declare global {
  interface Window {
    webkit?: { messageHandlers: { avatar: { postMessage(value: unknown): void } } };
    companion: { setState(phase: string, reduceMotion: boolean): void;
      setViewport(width: number, height: number): void; setSpeech(level: number, capturedAt: number, sequence: number): void; setFrameRate(fps: number): void; setActive(active: boolean): void; ready: boolean; phase: string };
  }
}

const report = (type: string, detail = '') => {
  window.webkit?.messageHandlers.avatar.postMessage({ type, detail });
  document.documentElement.dataset.status = type;
};
const acting = new ActingController();
let frameRate = 60;
let active = true;
let phase = 'idle';
let reduced = false;
const speechSamples = new SpeechSamples();
const timeline = new AnimationTimeline();
const syncVisibility = () => {
  const visible = active && !document.hidden;
  timeline.setActive(visible);
  speechSamples.setActive(visible);
};
document.addEventListener('visibilitychange', syncVisibility);
syncVisibility();
let nativeSize: { width: number; height: number } | undefined;
let applyResize: (() => void) | undefined;
window.companion = {
  ready: false,
  phase,
  setActive(value) {
    active = value === true;
    syncVisibility();
  },
  setFrameRate(fps) { if (Number.isInteger(fps) && fps >= 1 && fps <= 240) frameRate = fps; },
  setSpeech(level, capturedAt, sequence) { speechSamples.receive(level, capturedAt, sequence); },
  setViewport(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    nativeSize = { width, height }; applyResize?.();
  },
  setState(next, reduceMotion) {
    if (!['idle', 'listening', 'thinking', 'speaking'].includes(next)) return;
    if (phase !== next) speechSamples.reset();
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
  VRMUtils.rotateVRM0(avatar);
  VRMUtils.removeUnnecessaryVertices(avatar.scene);
  VRMUtils.combineSkeletons(avatar.scene);
  VRMUtils.combineMorphs(avatar);
  avatar.scene.traverse(object => { object.frustumCulled = false; });
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
    if (tap && active && hitCharacter(event)) acting.trigger('touch');
  });
  renderer.domElement.addEventListener('pointercancel', () => { pointer = undefined; });
  renderer.domElement.addEventListener('lostpointercapture', () => { pointer = undefined; });
  const bone = (name: Parameters<typeof avatar.humanoid.getNormalizedBoneNode>[0]) => avatar.humanoid.getNormalizedBoneNode(name);
  const stance = new PlantedStance(avatar.scene, bone, height, avatar.meta.metaVersion === '0' ? -1 : 1);
  const head = bone('head'), neck = bone('neck'), spine = bone('spine'), chest = bone('chest');
  const leftElbow = bone('leftLowerArm'), rightElbow = bone('rightLowerArm');
  const leftHand = bone('leftHand'), rightHand = bone('rightHand');
  const fingers = ['Index', 'Middle', 'Ring', 'Little'].flatMap(finger =>
    ['Proximal', 'Intermediate', 'Distal'].map((joint, index) => ({
      left: bone(`left${finger}${joint}` as Parameters<typeof bone>[0]),
      right: bone(`right${finger}${joint}` as Parameters<typeof bone>[0]), scale: [0.8, 0.9, 0.55][index],
    })));
  let mouth = 0, elapsed = 0;
  acting.update(0, reduced); acting.trigger('greeting');
  renderer.setAnimationLoop(timestamp => {
    // A cap is a target, not a claim about measured device performance.
    const cap = reduced ? Math.min(frameRate, 30) : frameRate;
    if (contextLost || renderer.getContext().isContextLost()) return;
    const delta = timeline.advance(timestamp, cap);
    if (delta === null) return;
    elapsed += delta;
    const pose = acting.update(delta, reduced);
    document.documentElement.dataset.motion = reduced ? 'reduced' : acting.clip;
    const face = motion(elapsed, phase, reduced, speechSamples.level());
    turntable.rotation.y = THREE.MathUtils.damp(turntable.rotation.y, rotation, 6, delta);
    stance.apply(pose);
    if (left) left.rotation.set(pose.leftRoll, armSign * pose.leftForward, armSign * (1.2 - pose.leftLift));
    if (right) right.rotation.set(pose.rightRoll, -armSign * pose.rightForward, -armSign * (1.2 - pose.rightLift));
    if (leftElbow) leftElbow.rotation.z = -armSign * pose.leftElbow;
    if (rightElbow) rightElbow.rotation.z = armSign * pose.rightElbow;
    if (leftHand) leftHand.rotation.set(0, pose.leftPalm, armSign * pose.leftWrist);
    if (rightHand) rightHand.rotation.set(0, pose.rightPalm, -armSign * pose.rightWrist);
    for (const finger of fingers) {
      if (finger.left) finger.left.rotation.z = -armSign * pose.leftCurl * finger.scale;
      if (finger.right) finger.right.rotation.z = armSign * pose.rightCurl * finger.scale;
    }
    if (spine) spine.rotation.set(pose.spineX, 0, pose.spineZ);
    if (chest) chest.rotation.set(pose.chestX, pose.chestY, pose.chestZ);
    if (neck) neck.rotation.x = pose.neckX;
    if (head) head.rotation.set(pose.headX, pose.headY, pose.headZ);
    target.position.set(pose.gazeX * height, center.y + height * (0.24 + pose.gazeY), 3);
    avatar.expressionManager?.setValue('blink', face.blink);
    mouth = phase === 'speaking' ? THREE.MathUtils.damp(mouth, face.mouth, 28, delta) : 0;
    avatar.expressionManager?.setValue('aa', mouth);
    avatar.expressionManager?.setValue('happy', pose.smile);
    avatar.update(delta);
    renderer.render(scene, camera);
    if (!window.companion.ready) { window.companion.ready = true; report('ready'); }
  });
}

main().catch(error => {
  report('error', String(error));
  const message = document.createElement('p'); message.id = 'error';
  message.textContent = 'Персонаж не загрузился'; document.body.appendChild(message);
});
