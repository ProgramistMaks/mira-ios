const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const editor = require('../project-files.cjs'),
  { FileIndex } = require('../file-index.cjs');
test('Project editor saves the selected revision and preserves external changes', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-edit-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'draft.md');
  await fs.writeFile(file, 'Первый');
  const draft = await editor.read(dir, 'draft.md');
  assert.deepEqual((await editor.list(dir)).files, ['draft.md']);
  await editor.save(dir, { ...draft, text: 'Второй' });
  assert.equal(await fs.readFile(file, 'utf8'), 'Второй');
  await assert.rejects(editor.save(dir, { ...draft, text: 'Устаревший' }), /изменился/);
  await assert.rejects(editor.read(dir, '../draft.md'));
  await assert.rejects(editor.read(dir, '.git/config'));
});
test('Concurrent index rebuilds apply the requested exclusions and reload from disk', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-index-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'docs'),
    skip = path.join(root, 'private');
  await fs.mkdir(skip, { recursive: true });
  await fs.writeFile(path.join(root, 'one.txt'), 'a');
  await fs.writeFile(path.join(skip, 'two.txt'), 'b');
  const folders = [{ path: root, name: 'docs' }],
    index = new FileIndex(dir);
  const [all, filtered] = await Promise.all([index.prepare(folders), index.prepare(folders, [skip], true)]);
  assert.equal(all.rows.length, 2);
  assert.equal(filtered.rows.length, 1);
  assert.deepEqual(await new FileIndex(dir).prepare(folders, [skip]), filtered);
});
