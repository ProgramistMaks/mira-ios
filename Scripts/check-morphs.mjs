// Browser-side regression probe, bundled only by check-renderer (never shipped).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export async function checkMorphs() {
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const load = async () => {
    const { userData: { vrm } } = await loader.loadAsync('/character.vrm');
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    return vrm;
  };
  const original = await load(), optimized = await load();
  const meshes = vrm => {
    const result = [];
    vrm.scene.traverse(node => { if (node.isMesh) result.push(node); });
    return result;
  };
  const stats = vrm => {
    const arrays = new Set(); let targets = 0;
    for (const mesh of meshes(vrm)) {
      targets += mesh.geometry.morphAttributes.position?.length ?? 0;
      for (const attributes of Object.values(mesh.geometry.morphAttributes)) {
        for (const attribute of attributes) arrays.add(attribute.array);
      }
    }
    return { targets, attributeBytes: [...arrays].reduce((sum, array) => sum + array.byteLength, 0) };
  };
  const before = stats(original);
  VRMUtils.combineMorphs(optimized);
  const after = stats(optimized);
  const names = Object.keys(original.expressionManager.expressionMap);
  const cases = [{}, ...names.map(name => ({ [name]: 1 })),
    { blink: 0.4, aa: 0.8, happy: 0.3 }, { blink: 1, aa: 1, happy: 1 }];
  const sample = (vrm, values) => {
    for (const name of names) vrm.expressionManager.setValue(name, values[name] ?? 0);
    vrm.expressionManager.update();
    return meshes(vrm).flatMap(mesh => ['position', 'normal'].map(kind => {
      const base = mesh.geometry.attributes[kind];
      if (!base) return new Float32Array();
      const result = new Float32Array(base.count * 3);
      const targets = mesh.geometry.morphAttributes[kind] ?? [];
      for (let vertex = 0; vertex < base.count; vertex++) {
        for (let axis = 0; axis < 3; axis++) {
          const initial = base.getComponent(vertex, axis);
          let value = initial;
          for (let target = 0; target < targets.length; target++) {
            const weight = mesh.morphTargetInfluences[target];
            if (weight) value += weight * (targets[target].getComponent(vertex, axis)
              - (mesh.geometry.morphTargetsRelative ? 0 : initial));
          }
          result[vertex * 3 + axis] = value;
        }
      }
      return result;
    }));
  };
  let maxDelta = 0;
  for (const values of cases) {
    const expected = sample(original, values), actual = sample(optimized, values);
    if (expected.length !== actual.length) throw new Error('Morph mesh count changed');
    expected.forEach((array, index) => {
      if (array.length !== actual[index].length) throw new Error('Morph vertex count changed');
      array.forEach((value, offset) => { maxDelta = Math.max(maxDelta, Math.abs(value - actual[index][offset])); });
    });
  }
  VRMUtils.deepDispose(original.scene); VRMUtils.deepDispose(optimized.scene);
  return { before, after, cases: cases.length, maxDelta };
}
