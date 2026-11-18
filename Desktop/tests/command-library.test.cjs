const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { matchPhrase, scanShortcuts, addMissing, suggestPhrases } = require('../command-library.cjs');
const { runRoutine, Store } = require('../core.cjs');

test('voice triggers compare the entire phrase and leave ambiguous matches unresolved', () => {
  const one = { phrase: 'открой календарь', name: 'Команда' };
  const settings = { allowTypos: true, phraseThreshold: 0.9 };
  assert.equal(matchPhrase([one], 'Открой каленадрь!', settings), one);
  assert.equal(matchPhrase([one], 'открой календарь', { ...settings, allowTypos: false }), one);
  for (const input of ['Команда', 'календарь', 'пожалуйста открой календарь'])
    assert.equal(matchPhrase([one], input, settings), undefined);
  assert.equal(matchPhrase([one, { phrase: 'открой календари' }], 'открой календаря', settings), undefined);
  assert.equal(matchPhrase([one], 'открой календари', { ...settings, phraseThreshold: 1 }), undefined);
});

test('scans nested Start Menu shortcuts, keeps the user entry and installs missing commands only', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mira-start-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const user = path.join(root, 'user'),
    common = path.join(root, 'common'),
    nested = path.join(common, 'Office');
  await mkdir(user);
  await mkdir(nested, { recursive: true });
  for (const f of [
    path.join(user, 'Почта.lnk'),
    path.join(common, 'Почта.LNK'),
    path.join(nested, 'Календарь.lnk'),
    path.join(user, 'Текст.txt'),
  ])
    await writeFile(f, 'fixture');
  const apps = await scanShortcuts([user, common, path.join(root, 'absent')]);
  assert.deepEqual(
    apps.map((x) => x.name),
    ['Календарь', 'Почта'],
  );
  assert.equal(apps[1].file, path.join(user, 'Почта.lnk'));
  const state = new Store(root).data;
  const specs = apps.map((v) => ({
    id: v.id,
    name: v.name,
    phrase: 'открой ' + v.name,
    group: 'Приложения',
    blocks: [{ kind: 'file', value: v.id }],
    link: { id: v.id, path: v.file },
  }));
  assert.equal(addMissing(state, specs), 2);
  state.routines.find((x) => x.id === apps[0].id).phrase = 'мои дела';
  assert.equal(addMissing(state, specs), 0);
  assert.equal(state.files.length, 2);
  assert.equal(state.routines.find((x) => x.id === apps[0].id).phrase, 'мои дела');
});

test('per-run limits bound loops, and a running condition-only graph can be stopped', async () => {
  const loop = {
    name: 'Цикл',
    blocks: [
      { kind: 'note', value: 'x' },
      { kind: 'repeat', value: '7', alternate: 0 },
    ],
  };
  const run = (opts) => runRoutine(loop, () => {}, undefined, opts);
  await assert.rejects(run({ routineRepeats: 2 }), /итераций/);
  await assert.rejects(run({ routineSteps: 3 }), /шагов/);
  await run({ routineSteps: 14, routineRepeats: 7 });
  const end = new AbortController();
  setImmediate(() => end.abort(Error('остановлено')));
  await assert.rejects(
    runRoutine(
      { name: 'Проверка', blocks: [{ kind: 'ifTime', value: '00-23', next: 0, alternate: 0 }] },
      () => {},
      end.signal,
    ),
    /остановлено/,
  );
});

test('local phrase suggestions map only selected shortcuts, including across batches', async () => {
  const apps = Array.from({ length: 21 }, (_, i) => ({ id: 'id-' + i, name: 'Программа ' + i }));
  const batch = [];
  const suggested = await suggestPhrases(apps, async ([, user]) => {
    const names = JSON.parse(user.content);
    batch.push(names.length);
    return JSON.stringify({ phrases: names.map((name) => 'открой ' + name) });
  });
  assert.deepEqual(batch, [20, 1]);
  assert.equal(suggested['id-20'], 'открой Программа 20');
  await assert.rejects(
    suggestPhrases(apps, async () => '{"phrases":[]}'),
    /неполный список/,
  );
});
