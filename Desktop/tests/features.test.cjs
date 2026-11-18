const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { routine, runRoutine, checkVRM, widgetLayout } = require('../core.cjs');
const { calendarPhrase, nextDue, plan } = require('../planner.cjs');
const { manifest } = require('../extensions.cjs');
const { dress } = require('../wardrobe.cjs');
const { Workshop, repository } = require('../workshop.cjs');
const { processRunning } = require('../process-running.cjs');
const speechAPI = require('../speech-api.cjs');
const single = { name: 'Утро', phrase: 'будильник', blocks: [{ kind: 'note', value: 'утро' }] };
test('wardrobe preserves Vita skeleton, valid buffer ranges and four normalized influences per garment vertex', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../Renderer/public/character.vrm'));
  const parse = (b) => JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12))),
    base = parse(source);
  assert.equal(dress(source, 'original'), source);
  for (const id of ['iris', 'evening']) {
    const bytes = dress(source, id),
      g = parse(bytes),
      start = 28 + bytes.readUInt32LE(12);
    checkVRM(bytes);
    assert.deepEqual(g.skins, base.skins);
    assert.equal(g.meshes.length, base.meshes.length + 1);
    const skin = g.skins[g.nodes.at(-1).skin];
    const influenced = new Set();
    for (const p of g.meshes.at(-1).primitives) {
      const access = (semantic) => {
        const a = g.accessors[p.attributes[semantic]],
          v = g.bufferViews[a.bufferView];
        return [start + v.byteOffset, a.count];
      };
      const [ji, count] = access('JOINTS_0'),
        [wi] = access('WEIGHTS_0');
      for (let v = 0; v < count; v++) {
        let total = 0;
        for (let k = 0; k < 4; k++) {
          const j = bytes.readUInt16LE(ji + (v * 4 + k) * 2),
            w = bytes.readFloatLE(wi + (v * 4 + k) * 4);
          assert.ok(j < skin.joints.length);
          assert.ok(w >= 0 && w <= 1);
          total += w;
          if (w > 0.01) influenced.add(g.nodes[skin.joints[j]].name);
        }
        assert.ok(Math.abs(total - 1) < 0.00001);
      }
    }
    assert.ok([...influenced].some((n) => n.includes('Bust')));
    assert.ok([...influenced].some((n) => n.includes('SkirtFront')));
    assert.ok(g.bufferViews.every((v) => (v.byteOffset || 0) + v.byteLength <= g.buffers[0].byteLength));
  }
});
test('wake detection keeps unrelated speech out of conversation and only consumes a complete name', async () => {
  const { address } = await import('../ui/wake.mjs');
  assert.deepEqual(address('Посреди мира шум', 'Мира', true), { waiting: true });
  assert.deepEqual(address('Миранда, привет', 'Мира', true), { waiting: true });
  assert.equal(address('Эй, Мира! Запиши планы', 'Мира', true).text, 'Запиши планы');
  assert.ok(address('Мира.', 'Мира', true).reply);
  assert.equal(address('жди обращения', 'Мира', false).waiting, true);
  assert.equal(address('А+Б, привет', 'А+Б', true).text, 'привет');
});
test('planner drafts safe editable offline commands and rejects an unavailable file identifier', async () => {
  const r = await plan('Утро: включи фокус на 25 минут и запиши планы', () => assert.fail(), []);
  assert.equal(r.name, 'Утро');
  assert.deepEqual(
    r.blocks.map((b) => b.kind),
    ['focus', 'note'],
  );
  await assert.rejects(
    plan(
      'используй файл',
      async () => JSON.stringify({ ...single, blocks: [{ kind: 'file', value: 'missing' }] }),
      [],
    ),
    /недоступное/,
  );
  assert.equal((await plan('Сложная просьба', async () => JSON.stringify(single), [])).name, 'Утро');
});
test('calendar keeps weekly local wall time and chooses the next weekday after today’s occurrence', () => {
  const now = new Date(2026, 10, 18, 12),
    weekly = calendarPhrase('Напомни каждую пятницу в 18:12 закрыть отчёт', now);
  assert.equal(new Date(weekly.time).getDay(), 5);
  assert.equal(weekly.repeat, 'week');
  const due = nextDue(weekly.time, 'week', +new Date(2027, 0, 12, 22));
  assert.ok(due > +new Date(2027, 0, 12, 22));
  assert.equal(new Date(due).getHours(), 18);
  assert.equal(
    calendarPhrase('напомни в пятницу в 8 позвонить', new Date(2026, 10, 20, 12)).time,
    +new Date(2026, 10, 27, 8),
  );
  assert.throws(() => calendarPhrase('напомни каждый день в 27 поесть', now));
});
test('widget layout preserves new defaults and process condition follows the false branch', async () => {
  const layout = widgetLayout([
    { id: 'notes', visible: false },
    { id: 'notes', visible: true },
    { id: 'bad' },
  ]);
  assert.equal(layout.length, 8);
  assert.deepEqual(layout[0], { id: 'notes', visible: false });
  const events = [];
  await runRoutine(
    {
      name: 'Ветка',
      blocks: [
        { kind: 'processRunning', value: 'missing', alternate: 2 },
        { kind: 'note', value: 'ошибка' },
        { kind: 'task', value: 'готово' },
      ],
    },
    async (b) => (b.kind === 'processRunning' ? false : events.push(b.value)),
  );
  assert.deepEqual(events, ['готово']);
  assert.throws(() => routine({ name: 'X', blocks: [{ kind: 'processRunning', value: '../../file' }] }));
  assert.equal(await processRunning('mira-nonexistent-proc-42'), false);
});
test('extension manifests validate local references, endpoints and theme values before installing anything', () => {
  const c = manifest({
    routines: [single],
    contributions: {
      panel: { commands: [0] },
      speech: { base: 'http://localhost:9999/v1', ttsModel: 'test' },
      theme: { theme: 'cream', accent: '#808080' },
    },
  });
  assert.deepEqual(c.contributions.panel.commands, [0]);
  assert.throws(() => manifest({ contributions: { panel: { commands: [7] } } }));
  assert.throws(() => manifest({ contributions: { ai: { base: 'file:///x', model: 'x' } } }));
  assert.throws(() => manifest({ contributions: { theme: { theme: 'cream', accent: 'url(x)' } } }));
  assert.equal(
    manifest({ contributions: { ai: { base: 'https://example.org/v1', model: 'model' } } }).routines.length,
    0,
  );
});
test('workshop create, inspect, compare-and-swap update and removal with encoded Cyrillic filenames', async () => {
  const rows = new Map();
  let rev = 0;
  const request = async (url, o) => {
    const f = decodeURIComponent(new URL(url).pathname.split('/').at(-1)),
      ret = (value, status = 200) => Response.json(value, { status });
    if (o.method === 'GET' && f === 'mira-workshop')
      return ret([...rows].map(([name, v]) => ({ name, type: 'file', size: 60, sha: v.sha })));
    if (o.method === 'GET') return rows.has(f) ? ret(rows.get(f)) : ret({}, 404);
    assert.equal(o.headers.Authorization, 'Bearer test-token');
    const data = JSON.parse(o.body);
    if (rows.get(f)?.sha !== data.sha) return ret({}, 409);
    if (o.method === 'DELETE') {
      rows.delete(f);
      return ret({});
    }
    const sha = 'revision-' + ++rev;
    rows.set(f, { size: 120, sha, encoding: 'base64', content: data.content });
    return ret({ content: { sha } });
  };
  assert.throws(() => repository('a/..'));
  const git = new Workshop('owner/mira', 'test-token', request),
    work = { id: 'test', name: 'Моё утро', routines: [single] };
  const v1 = await git.publish(work);
  assert.equal((await git.list())[0].name, 'Моё утро');
  assert.equal((await git.read(v1.key)).routines[0].phrase, 'будильник');
  const v2 = await git.publish(work, v1);
  await assert.rejects(git.publish(work, v1), /изменилась/);
  await git.remove(v2);
  assert.equal((await git.list()).length, 0);
});
test('compatible speech provider uploads a WAV as multipart and returns audio for the selected voice', async (t) => {
  const wav = fs.readFileSync(path.join(__dirname, 'fixtures/note-ru.wav')),
    seen = [];
  const server = http.createServer(async (req, res) => {
    const data = [];
    for await (const chunk of req) data.push(chunk);
    const body = Buffer.concat(data);
    assert.equal(req.headers.authorization, 'Bearer sample');
    if (req.url.endsWith('transcriptions')) {
      assert.ok(body.includes(Buffer.from('RIFF')));
      assert.ok(body.includes('whisper-test'));
      seen.push('stt');
      res.end(JSON.stringify({ text: ' Привет ' }));
    } else {
      const params = JSON.parse(body);
      assert.equal(params.voice, 'voice-id');
      assert.equal(params.input, 'Привет');
      seen.push('tts');
      res.end(wav);
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(
    () =>
      new Promise((ok) => {
        server.close(ok);
        server.closeAllConnections();
      }),
  );
  const c = {
    base: 'http://127.0.0.1:' + server.address().port + '/v1',
    sttModel: 'whisper-test',
    ttsModel: 'tts-test',
    voice: 'voice-id',
  };
  assert.equal(await speechAPI.transcribe(c, 'sample', wav), 'Привет');
  assert.deepEqual(await speechAPI.speak(c, 'sample', 'Привет'), wav);
  assert.deepEqual(seen, ['stt', 'tts']);
});

test('a generated notification is not duplicated by a small local model', async () => {
  const draft = {
    name: 'Движение',
    phrase: '',
    blocks: Array.from({ length: 3 }, () => ({ kind: 'notify', value: 'Подвигайся' })),
  };
  const result = await plan(
    'Хочу уведомление о разминке',
    async (msgs, schema) => {
      assert.deepEqual(schema.properties.blocks.items.properties.kind.enum, ['notify']);
      return JSON.stringify(draft);
    },
    [],
  );
  assert.equal(result.blocks.length, 1);
});

test('both dressed avatars deform their bodice on inhale and their skirt with the original cloth bones', async () => {
  const { DataTexture, Vector3 } = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');
  const { VitaSecondary } = await import('../../Renderer/vita-secondary.mjs');
  const source = fs.readFileSync(path.join(__dirname, '../../Renderer/public/character.vrm'));
  for (const outfit of ['iris', 'evening']) {
    const loader = new GLTFLoader();
    loader.register((parser) => {
      parser.loadTexture = async () => new DataTexture();
      return new VRMLoaderPlugin(parser);
    });
    const glb = dress(source, outfit);
    const {
      userData: { vrm },
    } = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '');
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    const rig = new VitaSecondary(vrm);
    VRMUtils.rotateVRM0(vrm);
    VRMUtils.combineSkeletons(vrm.scene);
    const garments = [];
    vrm.scene.traverse((mesh) => {
      if (mesh.isSkinnedMesh && [mesh.material].flat().some((m) => m.name.startsWith(outfit + '-')))
        garments.push(mesh);
    });
    assert.ok(garments.length);
    const points = () =>
      garments.flatMap((mesh) => {
        const position = mesh.geometry.attributes.position;
        const out = [];
        for (let i = 0; i < position.count; i += 4)
          out.push(
            mesh.localToWorld(mesh.applyBoneTransform(i, new Vector3().fromBufferAttribute(position, i))),
          );
        return out;
      });
    const delta = (a, b) => Math.max(...a.map((v, i) => v.distanceTo(b[i])));
    rig.update(0, 'idle', 0, true);
    vrm.scene.updateMatrixWorld(true);
    const rest = points();
    rig.update(0, 'idle', 1, true);
    vrm.scene.updateMatrixWorld(true);
    const inhaled = points();
    assert.ok(delta(rest, inhaled) > 0.0005, outfit + ' bodice should follow breathing');
    const chain = vrm.scene.getObjectByName('J_Sec_L_SkirtFront0');
    chain.rotateX(0.28);
    vrm.scene.updateMatrixWorld(true);
    assert.ok(delta(inhaled, points()) > 0.001, outfit + ' hem should follow moving cloth');
  }
});
