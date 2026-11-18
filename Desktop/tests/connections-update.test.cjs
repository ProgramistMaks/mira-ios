const assert = require('node:assert/strict');
const test = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { discover } = require('../provider-models.cjs');
const { checkUpdate, getArchive } = require('../desktop-update.cjs');

test('model discovery uses the saved provider key and handles Anthropic pagination', async () => {
  const base = 'https://api.anthropic.com/v1';
  const calls = [];
  const fetch = async (url, options) => {
    calls.push([url.href, options.headers]);
    return Response.json(url.search
      ? { data: [{ id: 'claude-b' }, { id: 'claude-a' }] }
      : { data: [{ id: 'claude-a' }], has_more: true, last_id: 'claude-a' });
  };
  assert.deepEqual(await discover(base, 'fixture-key', fetch), ['claude-a', 'claude-b']);
  assert.equal(calls[0][1]['x-api-key'], 'fixture-key');
  assert.equal(calls[1][0], base + '/models?after_id=claude-a');
  await assert.rejects(discover('https://api.openai.com/v1', 'fixture-key', async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    assert.equal(options.redirect, 'error');
    return new Response(null, { status: 401 });
  }), /HTTP 401/);
});

test('updates accept only a newer verified Windows archive from the app repository', async () => {
  const commit = 'a'.repeat(40);
  const sha = createHash('sha256').update('fixture').digest('hex');
  const origin = 'https://github.com/ProgramistMaks/mira-ios/raw/' + commit;
  const manifest = (version, url = origin) => ({
    tag_name: 'desktop-v' + version,
    body: url + '/Mira-PC-' + version + '-Windows-x64.zip\nSHA-256 архива `' + sha + '`.',
  });
  const update = await checkUpdate('0.11.0', async () => Response.json([
    manifest('9.0.0', 'https://example.com'),
    manifest('0.12.0'),
    { ...manifest('0.13.0'), prerelease: true },
  ]));
  assert.equal(update.version, '0.12.0');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-update-test-'));
  try {
    const file = path.join(directory, 'archive.zip');
    await getArchive(update, file, async () => new Response('fixture'));
    assert.equal(await fs.readFile(file, 'utf8'), 'fixture');
    await assert.rejects(getArchive(update, file + '.bad', async () => new Response('modified')), /сумма/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
