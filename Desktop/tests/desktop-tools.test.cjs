const { test } = require('node:test'),
  assert = require('node:assert/strict');
const path = require('node:path'),
  os = require('node:os'),
  fs = require('node:fs/promises');
const { CacheCleaner, cacheFolders } = require('../maintenance.cjs');
const { branches } = require('../project-git.cjs');
const { AssistantJobs, generateImage } = require('../assistant-jobs.cjs');
const { desktopIntent, openBrowser } = require('../pc-intent.cjs');
const { region, polygon } = require('../widget-shape.cjs');
const run = require('node:util').promisify(require('node:child_process').execFile);
async function folder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-tools-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('Cache preview is single use and scoped to unchanged regular files in selected cache categories', async (t) => {
  const root = await folder(t),
    dir = path.join(root, 'Cache');
  await fs.mkdir(dir);
  await fs.writeFile(path.join(root, 'Cookies'), 'keep');
  await fs.writeFile(path.join(dir, 'one'), '123');
  await fs.writeFile(path.join(dir, 'two'), '123');
  if (process.platform !== 'win32') await fs.symlink(path.join(root, 'Cookies'), path.join(dir, 'link'));
  const cleaner = new CacheCleaner(cacheFolders(root)),
    plan = await cleaner.preview();
  assert.equal(plan.files.length, 2);
  await fs.appendFile(path.join(dir, 'two'), 'new');
  await fs.writeFile(path.join(dir, 'later'), 'keep');
  assert.deepEqual(await cleaner.remove(plan.token, ['Cache']), { files: 1, bytes: 3, skipped: 1 });
  await assert.rejects(cleaner.remove(plan.token, ['Cache']));
  for (const file of ['Cache/two', 'Cache/later', 'Cookies']) await fs.access(path.join(root, file));
});
test('Browser cache profiles exclude history, credentials and extra directories', async (t) => {
  const root = await folder(t),
    profile = path.join(root, 'Google', 'Chrome', 'User Data', 'Profile 3');
  await fs.mkdir(path.join(profile, 'Cache'), { recursive: true });
  await fs.writeFile(path.join(profile, 'Cache', 'data'), 'abc');
  await fs.writeFile(path.join(profile, 'History'), 'abc');
  const cleaner = new CacheCleaner(cacheFolders(path.join(root, 'Mira'), root)),
    r = await cleaner.preview();
  assert.deepEqual(r.files, [{ id: 'Chrome / Profile 3 / Cache', name: 'data', size: 3 }]);
});
test('Git lists actual local refs, switches clean branches, rejects dirty and non-root projects', async (t) => {
  const root = await folder(t),
    git = (...args) => run('git', args, { cwd: root });
  await git('init', '-b', 'main');
  await git(
    '-c',
    'user.name=Mira',
    '-c',
    'user.email=test@localhost',
    'commit',
    '--allow-empty',
    '-m',
    'start',
  );
  assert.equal((await branches(root, 'create', 'тест/черновик')).current, 'тест/черновик');
  assert.deepEqual((await branches(root, 'switch', 'main')).branches.sort(), ['main', 'тест/черновик']);
  await fs.writeFile(path.join(root, 'notes'), 'keep');
  await assert.rejects(branches(root, 'switch', 'тест/черновик'), /изменения/);
  assert.equal((await branches(root)).current, 'main');
  await assert.rejects(branches(root, 'create', '--detach'));
  const sub = path.join(root, 'sub');
  await fs.mkdir(sub);
  await assert.rejects(branches(sub), /корневую/);
});
test('Voice intents use fixed targets and do not treat questions or command suffixes as executable', async () => {
  for (const text of ['Открой браузер гугол', 'Открывай браузер Google.', 'Открой Браузер-Бугл.', 'Мира, открой браузер Google, пожалуйста!', 'Open Google'])
    assert.equal(desktopIntent(text), 'browser');
  for (const [text, id] of [
    ['запусти google chrome', 'chrome'],
    ['открой папку загрузок', 'downloads'],
    ['open calculator', 'calculator'],
  ])
    assert.equal(desktopIntent(text), id);
  assert.equal(desktopIntent('Открою браузер Google.', true), 'browser');
  assert.equal(desktopIntent('Открою браузер Google.'), undefined);
  for (const text of ['как открыть браузер', 'открой chrome && calc', 'открой браузер и удали файл'])
    assert.equal(desktopIntent(text), undefined);
  const urls = [];
  await openBrowser('browser', { openExternal: (url) => urls.push(url) });
  assert.deepEqual(urls, ['https://www.google.com/']);
});
test('Concave custom shapes clip an actual hole in a scan line and scale with the window', () => {
  const p = polygon('0,0 100,0 100,100 70,100 70,30 30,30 30,100 0,100');
  for (const side of [100, 200]) {
    const rects = region(p, side, side),
      contains = (x, y) => rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
    assert.ok(contains(side * 0.5, side * 0.1));
    assert.ok(!contains(side * 0.5, side * 0.5));
    assert.ok(contains(side * 0.2, side * 0.5));
  }
  assert.throws(() => polygon('0,0 50,50 100,100'));
  assert.throws(() => polygon('0,20 200,20 1,4'));
});
test('Assistant queue supports cancel, sequential execution and interrupted session recovery', async () => {
  const data = { assistantJobs: [{ status: 'running' }] },
    done = [];
  const jobs = new AssistantJobs(
    data,
    () => {},
    () => {},
    async (j, signal) => {
      if (j.prompt === 'wait')
        await new Promise((resolve, reject) =>
          signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }),
        );
      done.push(j.prompt);
      return 'result';
    },
  );
  assert.equal(data.assistantJobs[0].status, 'interrupted');
  const first = jobs.add('writer', 'wait');
  jobs.add('analyst', 'second');
  jobs.cancel(first);
  for (let i = 0; i < 20 && !done.length; i++) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(done, ['second']);
  assert.equal(jobs.list()[0].status, 'done');
  assert.equal(jobs.list()[1].status, 'cancelled');
});
test('Image generation checks provider response and saves decoded PNG only to the output directory', async (t) => {
  const root = await folder(t),
    signal = new AbortController().signal,
    id = require('node:crypto').randomUUID();
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const request = async (url, opts) => {
    assert.equal(new URL(url).host, 'api.openai.com');
    assert.equal(JSON.parse(opts.body).prompt, 'draw');
    return Response.json({ data: [{ b64_json: png }] });
  };
  assert.equal(await generateImage({ id, prompt: 'draw' }, root, 'fixture', signal, request), id);
  assert.equal((await fs.readFile(path.join(root, id + '.png'))).toString('base64'), png);
  await assert.rejects(
    generateImage({ id, prompt: 'bad' }, root, 'fixture', signal, async () =>
      Response.json({ data: [{ b64_json: 'bad' }] }),
    ),
  );
});
test('Git reports detached HEAD and protects a branch checked out in another worktree', async (t) => {
  const parent = await folder(t),
    root = path.join(parent, 'main'),
    other = path.join(parent, 'linked');
  await fs.mkdir(root);
  const git = (...args) => run('git', args, { cwd: root });
  await git('init', '-b', 'main');
  await git(
    '-c',
    'user.name=Mira',
    '-c',
    'user.email=test@localhost',
    'commit',
    '--allow-empty',
    '-m',
    'initial',
  );
  await git('worktree', 'add', '-b', 'linked', other);
  assert.equal((await branches(other)).current, 'linked');
  await assert.rejects(branches(root, 'switch', 'linked'));
  await git('switch', '--detach');
  assert.equal((await branches(root)).current, '');
  assert.equal((await branches(root, 'switch', 'main')).current, 'main');
});
