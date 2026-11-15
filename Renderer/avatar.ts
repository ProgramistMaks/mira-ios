import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { motion, greetingEnvelope } from './motion.mjs';

declare global {
  interface Window {
    webkit?: { messageHandlers: { avatar: { postMessage(value: unknown): void } } };
    companion: { setState(phase: string, reduceMotion: boolean): void; ready: boolean; phase: string };
  }
}

const report = (type: string, detail = '') => {
  window.webkit?.messageHandlers.avatar.postMessage({ type, detail });
  document.documentElement.dataset.status = type;
};
let phase = 'idle';
let reduced = false;
window.companion = {
  ready: false,
  phase,
  setState(next, reduceMotion) {
    if (!['idle', 'listening', 'thinking', 'speaking'].includes(next)) return;
    phase = next; reduced = reduceMotion; window.companion.phase = phase;
  },
};

async function main() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  const key = new THREE.DirectionalLight(0xfff0e4, 1.25);
  key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9e8bff, 0.6);
  rim.position.set(-2, 2, -2); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xe4e0ff, 0x3a314f, 0.75));
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync('character.vrm');
  const avatar = gltf.userData.vrm as VRM | undefined;
  if (!avatar) throw new Error('No VRM avatar');
  VRMUtils.rotateVRM0(avatar);
  VRMUtils.removeUnnecessaryVertices(avatar.scene);
  VRMUtils.combineSkeletons(avatar.scene);
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
    const width = Math.max(1, innerWidth), viewportHeight = Math.max(1, innerHeight);
    renderer.setSize(width, viewportHeight);
    camera.aspect = width / viewportHeight;
    const distance = height * 0.58 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, center.y + height * 0.03, distance * Math.max(1, 0.65 / camera.aspect));
    camera.lookAt(0, center.y, 0); camera.updateProjectionMatrix();
  };
  resize(); addEventListener('resize', resize);
  let rotation = 0, pointerX: number | null = null, pointerStart = 0, moved = false;
  let elapsed = 0, gestureStart = 0;
  renderer.domElement.addEventListener('pointerdown', event => {
    pointerX = event.clientX; pointerStart = event.clientX; moved = false;
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (pointerX === null) return;
    rotation = THREE.MathUtils.clamp(rotation + (event.clientX - pointerX) * 0.006, -0.65, 0.65);
    if (Math.abs(event.clientX - pointerStart) > 8) moved = true;
    pointerX = event.clientX;
  });
  renderer.domElement.addEventListener('pointerup', () => {
    if (!moved) gestureStart = elapsed;
    pointerX = null;
  });
  renderer.domElement.addEventListener('pointercancel', () => { pointerX = null; });
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); report('error', 'context lost'); });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  const head = avatar.humanoid.getNormalizedBoneNode('head');
  const spine = avatar.humanoid.getNormalizedBoneNode('spine');
  const elbow = avatar.humanoid.getNormalizedBoneNode('leftLowerArm');
  const wrist = avatar.humanoid.getNormalizedBoneNode('leftHand');
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    if (document.hidden) return;
    elapsed += delta;
    const pose = motion(elapsed, phase, reduced);
    const wave = greetingEnvelope(elapsed - gestureStart, reduced);
    turntable.rotation.y = THREE.MathUtils.damp(turntable.rotation.y, rotation, 6, delta);
    if (left) left.rotation.z = armSign * (1.2 - wave * 1.4 + pose.handSway);
    if (right) right.rotation.z = -armSign * (1.2 + pose.handSway);
    if (elbow) elbow.rotation.z = -armSign * wave * 1.25;
    if (wrist) wrist.rotation.z = armSign * wave * 0.18 * Math.sin(elapsed * 16);
    if (spine) spine.rotation.x = pose.breathe;
    if (head) head.rotation.z = pose.head;
    avatar.expressionManager?.setValue('blink', pose.blink);
    avatar.expressionManager?.setValue('aa', pose.mouth);
    avatar.expressionManager?.setValue('happy', pose.smile + wave * 0.12);
    avatar.update(delta);
    renderer.render(scene, camera);
  });
  window.companion.ready = true; report('ready');
}

main().catch(error => {
  report('error', String(error));
  const message = document.createElement('p'); message.id = 'error';
  message.textContent = 'Персонаж не загрузился'; document.body.appendChild(message);
});
