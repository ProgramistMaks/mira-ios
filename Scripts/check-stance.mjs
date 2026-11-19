// Test-only probe of the actual VRM retargeting, not part of the shipped bundle.
import { Box3, Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { PlantedStance } from '../Renderer/stance.mjs';
import { CLIPS, sampleClip } from '../Renderer/acting.mjs';
import { GESTURES, STANCES, encodeVariant, sampleVariant } from '../Renderer/expression-library.mjs';

export async function checkStance() {
  const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
  const { userData: { vrm } } = await loader.loadAsync('/character.vrm');
  VRMUtils.rotateVRM0(vrm); VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene); VRMUtils.combineMorphs(vrm);
  const bone = name => vrm.humanoid.getNormalizedBoneNode(name);
  const armSign = vrm.meta.metaVersion === '0' ? 1 : -1;
  bone('leftUpperArm').rotation.z = armSign * 1.2;
  bone('rightUpperArm').rotation.z = -armSign * 1.2;
  const turntable = new Group(); turntable.add(vrm.scene); vrm.update(0);
  const rootPosition = node => vrm.scene.worldToLocal(node.getWorldPosition(new Vector3()));
  const rootRotation = node => vrm.scene.getWorldQuaternion(new Quaternion()).invert()
    .multiply(node.getWorldQuaternion(new Quaternion()));
  const bounds = new Box3().setFromObject(vrm.scene);
  const height = bounds.max.y - bounds.min.y;
  const forward = vrm.meta.metaVersion === '0' ? -1 : 1;
  const stance = new PlantedStance(vrm.scene, bone, height, forward);
  const feet = ['left', 'right'].map(side => ({
    normalized: bone(`${side}Foot`), raw: vrm.humanoid.getRawBoneNode(`${side}Foot`),
    upper: bone(`${side}UpperLeg`), knee: bone(`${side}LowerLeg`),
  })).map(leg => ({ ...leg, normalizedAnchor: rootPosition(leg.normalized), rawAnchor: rootPosition(leg.raw),
    rawRotation: rootRotation(leg.raw),
    thigh: rootPosition(leg.upper).distanceTo(rootPosition(leg.knee)),
    shin: rootPosition(leg.knee).distanceTo(rootPosition(leg.normalized)),
  }));
  const originalHips = rootPosition(bone('hips'));
  const result = { samples: 0, maxNormalizedFootDrift: 0, maxRawFootDrift: 0,
    maxRawFootAngle: 0, maxLengthChange: 0, maxHipDisplacement: 0, minKneeForward: 0 };
  function* samples() {
    for (const [name, clip] of Object.entries(CLIPS)) {
      for(let t=0;t<=clip.duration;t+=1/30)yield {t,pose:sampleClip(name,t)};
    }
    // All gestures and stance choices on every conversational base at both peaks.
    for(let gesture=0;gesture<GESTURES.length;gesture++)for(let stance=0;stance<STANCES.length;stance++) {
      for(const phase of ['idle','listening','thinking','speaking'])for(const t of [.22,.43]) {
        yield {t,pose:sampleVariant(encodeVariant(gesture,0,0,stance),t,sampleClip(phase,t*CLIPS[phase].duration),1)};
      }
    }
  }
  for (const {t,pose} of samples()) {
      turntable.rotation.y = Math.sin(t * 0.3) * 0.65;
      stance.apply(pose); vrm.update(0);
      result.samples++;
      result.maxHipDisplacement = Math.max(result.maxHipDisplacement, originalHips.distanceTo(rootPosition(bone('hips'))));
      for (const leg of feet) {
        result.maxNormalizedFootDrift = Math.max(result.maxNormalizedFootDrift, leg.normalizedAnchor.distanceTo(rootPosition(leg.normalized)));
        result.maxRawFootDrift = Math.max(result.maxRawFootDrift, leg.rawAnchor.distanceTo(rootPosition(leg.raw)));
        result.maxRawFootAngle = Math.max(result.maxRawFootAngle, leg.rawRotation.angleTo(rootRotation(leg.raw)));
        const a = rootPosition(leg.upper), b = rootPosition(leg.knee), c = rootPosition(leg.normalized);
        result.maxLengthChange = Math.max(result.maxLengthChange, Math.abs(a.distanceTo(b) - leg.thigh), Math.abs(b.distanceTo(c) - leg.shin));
        const direction = c.clone().sub(a).normalize();
        const projection = a.clone().addScaledVector(direction, b.clone().sub(a).dot(direction));
        result.minKneeForward = Math.min(result.minKneeForward, (b.z - projection.z) * forward);
      }
  }
  VRMUtils.deepDispose(vrm.scene);
  return result;
}
