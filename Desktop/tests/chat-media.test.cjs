const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { ChatMedia } = require('../chat-media.cjs');
const { catalog, LocalModels } = require('../models.cjs');
test('rejected attachments roll back staged pictures and old messages stay readable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-context-')),
    media = new ChatMedia(dir);
  const sample = {
    kind: 'image',
    name: 'Кадр',
    data: 'data:image/jpeg;base64,' + Buffer.from([255, 216, 0, 0, 255, 217]).toString('base64'),
  };
  try {
    await assert.rejects(media.save([sample, { name: 'Слишком долго', text: 'a'.repeat(46000) }]), /45 000/);
    assert.deepEqual(await fs.readdir(media.dir), []);
    assert.throws(() => media.file('../../disk.jpg'));
    assert.deepEqual(
      await media.messages({
        messages: [
          { role: 'user', text: 'Привет' },
          { control: true, role: 'assistant', text: 'Настройка' },
        ],
      }),
      [{ role: 'user', content: 'Привет' }],
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('two quantizations of Qwen9 share one optional vision encoder and can release it independently', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-encoders-')),
    model = new LocalModels(dir, '', () => {});
  const sizes = new Map(),
    syncFs = require('node:fs'),
    statSync = syncFs.statSync;
  t.mock.method(syncFs, 'statSync', (p, ...args) => {
    const stat = statSync(p, ...args);
    if (sizes.has(p)) stat.size = sizes.get(p);
    return stat;
  });
  try {
    for (const id of ['qwen9', 'qwen9q3']) {
      const p = path.join(dir, id + '.gguf');
      await fs.writeFile(p, '');
      sizes.set(p, catalog.find((m) => m.id === id).bytes);
    }
    const file = path.join(
      dir,
      'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f.mmproj.gguf',
    );
    await fs.writeFile(file, '');
    sizes.set(file, 918166080);
    assert.ok(
      model
        .list()
        .filter((m) => m.id.startsWith('qwen9'))
        .every((m) => m.visionInstalled),
    );
    await model.remove('qwen9');
    assert.equal(model.list().find((m) => m.id === 'qwen9q3').visionInstalled, true);
    await model.remove('qwen9q3', true);
    const q = model.list().find((m) => m.id === 'qwen9q3');
    assert.equal(q.installed, true);
    assert.equal(q.visionInstalled, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
