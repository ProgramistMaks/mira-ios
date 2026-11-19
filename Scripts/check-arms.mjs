// Test-only measurement on the actual bundled Vita, including raw retargeted bones.
import { Vector3, Quaternion, Box3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { ArmRig } from '../Renderer/arms.mjs';
import { REST } from '../Renderer/acting.mjs';
export async function checkArms() {
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const {userData:{vrm}}=await loader.loadAsync('/character.vrm');
  VRMUtils.rotateVRM0(vrm);vrm.update(0);
  const bone=name=>vrm.humanoid.getNormalizedBoneNode(name);
  const arms=new ArmRig(bone,vrm.meta.metaVersion==='0'?1:-1);
  const size=new Box3().setFromObject(vrm.scene).getSize(new Vector3()).y;
  const measure=(side,raw)=>{
    const node=raw?vrm.humanoid.getRawBoneNode(side+'Hand'):bone(side+'Hand');
    return {position:node.getWorldPosition(new Vector3()),rotation:node.getWorldQuaternion(new Quaternion())};
  };
  const result={minPalmTurn:Infinity,minWristFlex:Infinity,maxWristDrift:0,height:size};
  for(const side of ['left','right']) {
    const pose={...REST,[side+'Lift']:.25,[side+'Elbow']:.9,[side+'Forward']:.4};
    arms.apply(pose);vrm.update(0);const before=[false,true].map(raw=>measure(side,raw));
    arms.apply({...pose,[side+'Palm']:1.05});vrm.update(0);
    for(const [index,raw] of [false,true].entries()) {
      const after=measure(side,raw);
      result.minPalmTurn=Math.min(result.minPalmTurn,before[index].rotation.angleTo(after.rotation));
      result.maxWristDrift=Math.max(result.maxWristDrift,before[index].position.distanceTo(after.position));
    }
    arms.apply({...pose,[side+'Flex']:.32});vrm.update(0);
    for(const [index,raw] of [false,true].entries()) {
      const after=measure(side,raw);
      result.minWristFlex=Math.min(result.minWristFlex,before[index].rotation.angleTo(after.rotation));
      result.maxWristDrift=Math.max(result.maxWristDrift,before[index].position.distanceTo(after.position));
    }
  }
  VRMUtils.deepDispose(vrm.scene);return result;
}
