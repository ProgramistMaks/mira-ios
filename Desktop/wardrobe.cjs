const fs = require('node:fs'),
  path = require('node:path');
const outfits = [
  { id: 'original', name: 'Исходный костюм' },
  { id: 'iris', name: 'Ирис · плиссированное платье' },
  { id: 'evening', name: 'Вечер · накидка и юбка' },
];
function dress(source, id) {
  if (id === 'original') return source;
  if (!outfits.some((o) => o.id === id)) throw Error('Неизвестный наряд');
  const length = source.readUInt32LE(12),
    g = JSON.parse(source.toString('utf8', 20, 20 + length)),
    data = [source.subarray(28 + length, 28 + length + g.buffers[0].byteLength)];
  let bytes = data[0].length;
  function accessor(values, componentType, type, width, bounds = false) {
    const start = (bytes + 3) & ~3,
      B = { 5126: Float32Array, 5123: Uint16Array }[componentType],
      view = Buffer.from(new B(values).buffer);
    data.push(Buffer.alloc(start - bytes), view);
    bytes = start + view.length;
    const bufferView = g.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: view.length }) - 1;
    const item = { bufferView, componentType, type, count: values.length / width };
    if (bounds) {
      item.min = [];
      item.max = [];
      for (let k = 0; k < width; k++) {
        const axis = values.filter((_, i) => i % width === k);
        item.min.push(Math.min(...axis));
        item.max.push(Math.max(...axis));
      }
    }
    return g.accessors.push(item) - 1;
  }
  const skin = g.nodes.find((n) => n.name === 'Body').skin,
    joints = g.skins[skin].joints;
  const bone = Object.fromEntries(
    g.extensions.VRM.humanoid.humanBones.map(({ bone, node }) => [bone, joints.indexOf(node)]),
  );
  const jointByName = new Map(joints.map((n, i) => [g.nodes[n].name, i]));
  const evening = id === 'evening';
  const colors = evening
    ? [
        [0.13, 0.095, 0.18, 1],
        [0.69, 0.41, 0.17, 1],
        [0.31, 0.2, 0.32, 1],
      ]
    : [
        [0.36, 0.34, 0.64, 1],
        [0.9, 0.7, 0.36, 1],
        [0.66, 0.56, 0.79, 1],
      ];
  const materials = colors.map((color, i) => {
    const name = id + '-' + i;
    g.extensions.VRM.materialProperties.push({
      name,
      shader: 'VRM_USE_GLTFSHADER',
      renderQueue: -1,
      floatProperties: {},
      vectorProperties: {},
      textureProperties: {},
      keywordMap: {},
      tagMap: {},
    });
    return (
      g.materials.push({
        name,
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0.04, roughnessFactor: 0.8 },
      }) - 1
    );
  });
  const primitives = [];
  function bands(rings, folds, amplitude, pattern) {
    const pos = [],
      normal = [],
      ids = [],
      weights = [],
      tri = [[], [], []],
      count = 96;
    for (const [row, [y, rx, rz, cz]] of rings.entries()) {
      for (let i = 0; i < count; i++) {
        const angle = (i * 2 * Math.PI) / count,
          flare = 1 + amplitude * Math.cos(folds * angle);
        pos.push(rx * flare * Math.cos(angle), y, cz + rz * flare * Math.sin(angle));
        const ca = Math.cos(angle),
          sa = Math.sin(angle),
          derivative = -amplitude * folds * Math.sin(folds * angle);
        const tangentX = rx * (derivative * ca - flare * sa),
          tangentZ = rz * (derivative * sa + flare * ca);
        const higher = rings[Math.max(0, row - 1)],
          lower = rings[Math.min(rings.length - 1, row + 1)];
        const dy = higher[0] - lower[0],
          nx = tangentZ * dy,
          nz = -tangentX * dy,
          ny =
            tangentX * ((higher[2] - lower[2]) * flare * sa + higher[3] - lower[3]) -
            tangentZ * (higher[1] - lower[1]) * flare * ca,
          scale = Math.hypot(nx, ny, nz);
        normal.push(nx / scale, ny / scale, nz / scale);
        const levels = [
          [0.72, Math.cos(angle) < 0 ? 'leftUpperLeg' : 'rightUpperLeg'],
          [0.97, 'hips'],
          [1.06, 'spine'],
          [1.16, 'chest'],
          [1.31, 'upperChest'],
        ];
        const high = levels.findIndex((l) => l[0] >= y),
          a = levels[high < 0 ? 4 : Math.max(0, high - 1)],
          b = levels[high < 0 ? 4 : high];
        const t = a === b ? 0 : Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0])));
        const side = ca < 0 ? 'L' : 'R';
        let follow = 0,
          secondaryA = 0,
          secondaryB = 0,
          blend = 0;
        if (y < 0.98) {
          // The original skirt chains already participate in VRM spring collisions.
          follow = Math.min(0.82, (0.98 - y) * 4.2);
          const region = sa < 0 ? 'Front' : 'Back';
          const segment = y < 0.83 ? 1 : 0;
          secondaryA = jointByName.get('J_Sec_' + side + '_SkirtSide' + segment);
          secondaryB = jointByName.get('J_Sec_' + side + '_Skirt' + region + segment);
          blend = Math.abs(sa);
        } else if (y > 1.16 && y < 1.35 && sa < 0) {
          // The bodice follows the same two spring joints that deform the underlying top.
          follow = Math.max(0, 1 - Math.abs(y - 1.25) / 0.1) * Math.min(1, -sa * 1.3) * 0.82;
          secondaryA = jointByName.get('J_Sec_' + side + '_Bust1');
          secondaryB = jointByName.get('J_Sec_' + side + '_Bust2');
          blend = 0.38;
        }
        ids.push(bone[a[1]], bone[b[1]], secondaryA, secondaryB);
        weights.push((1 - t) * (1 - follow), t * (1 - follow), (1 - blend) * follow, blend * follow);
      }
    }
    for (let r = 0; r < rings.length - 1; r++)
      for (let i = 0; i < count; i++) {
        const a = r * count + i,
          b = r * count + ((i + 1) % count),
          c = a + count,
          d = b + count;
        tri[pattern(r, i)].push(a, b, c, b, d, c);
      }
    const attributes = {
      POSITION: accessor(pos, 5126, 'VEC3', 3, true),
      NORMAL: accessor(normal, 5126, 'VEC3', 3),
      JOINTS_0: accessor(ids, 5123, 'VEC4', 4),
      WEIGHTS_0: accessor(weights, 5126, 'VEC4', 4),
    };
    for (let m = 0; m < 3; m++)
      if (tri[m].length)
        primitives.push({
          attributes,
          indices: accessor(tri[m], 5123, 'SCALAR', 1),
          material: materials[m],
          mode: 4,
        });
  }
  bands(
    [
      [1.093, 0.132, 0.1, -0.004],
      [1.081, 0.136, 0.105, -0.004],
      [1.06, 0.14, 0.107, -0.004],
      [0.979, 0.175, 0.115, 0],
      [0.905, 0.196, 0.14, 0.002],
      [evening ? 0.72 : 0.79, 0.242, 0.178, 0.002],
      [evening ? 0.712 : 0.782, 0.244, 0.18, 0.002],
      [evening ? 0.697 : 0.767, 0.247, 0.182, 0.002],
    ],
    16,
    0.045,
    (r, i) => (r === 1 || r === 5 ? 1 : r >= 3 && Math.floor(i / 3) % 2 ? 2 : 0),
  );
  if (evening)
    bands(
      [
        [1.403, 0.071, 0.072, 0.013],
        [1.385, 0.11, 0.088, 0.012],
        [1.354, 0.177, 0.112, 0.009],
        [1.303, 0.192, 0.137, 0.005],
        [1.262, 0.205, 0.152, 0.001],
        [1.253, 0.206, 0.151, 0.001],
      ],
      8,
      0.022,
      (r) => (r === 0 || r === 4 ? 1 : 0),
    );
  else
    bands(
      [
        [1.31, 0.135, 0.113, 0.002],
        [1.292, 0.148, 0.134, 0],
        [1.234, 0.145, 0.134, -0.002],
        [1.175, 0.137, 0.117, -0.002],
        [1.093, 0.133, 0.104, -0.004],
      ],
      4,
      0.012,
      (r, i) => (r === 0 ? 1 : Math.cos((i * Math.PI) / 48) > 0.8 ? 2 : 0),
    );
  const mesh = g.meshes.push({ name: 'Mira-' + id, primitives }) - 1;
  const node = g.nodes.push({ name: 'Mira outfit', skin, mesh }) - 1;
  g.scenes[g.scene || 0].nodes.push(node);
  g.buffers[0].byteLength = bytes;
  const json = Buffer.from(JSON.stringify(g)),
    jsonSize = (json.length + 3) & ~3,
    binSize = (bytes + 3) & ~3;
  const out = Buffer.alloc(28 + jsonSize + binSize);
  out.write('glTF');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonSize, 12);
  out.write('JSON', 16);
  out.fill(32, 20, 20 + jsonSize);
  json.copy(out, 20);
  out.writeUInt32LE(binSize, 20 + jsonSize);
  out.write('BIN\0', 24 + jsonSize);
  Buffer.concat(data).copy(out, 28 + jsonSize);
  return out;
}
function characterFile(store, renderer) {
  const own = store.data.avatars.find((a) => a.id === store.data.settings.avatar);
  if (own) return own.path;
  const base = path.join(renderer, 'character.vrm'),
    id = store.data.settings.outfit || 'original';
  if (id === 'original') return base;
  if (!outfits.some((o) => o.id === id)) throw Error('Неизвестный наряд');
  const dir = path.join(store.dir, 'wardrobe');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'vita-v2-' + id + '.vrm');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file + '.part', dress(fs.readFileSync(base), id));
    fs.renameSync(file + '.part', file);
  }
  return file;
}
module.exports = { outfits, dress, characterFile };
