const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile, readFile, stat } = require('node:fs/promises');
const path = require('node:path'),
  os = require('node:os'),
  http = require('node:http');
const { createHash } = require('node:crypto');
const { Store, runRoutine, routine, endpoint } = require('../core.cjs');
const { download } = require('../models.cjs');
const { mcp } = require('../network.cjs');
async function temporary(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mira-desktop-qa-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(
    () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  );
  return 'http://127.0.0.1:' + server.address().port;
}
test('profile persists routines and omits paths and credentials from renderer state', async (t) => {
  const dir = await temporary(t),
    profile = new Store(dir);
  profile.data.files.push({ id: 'file', name: 'test', path: '/private/test', kind: 'file' });
  profile.data.secrets.ai = 'encrypted sample';
  profile.data.settings.theme = 'rose';
  profile.save();
  const copy = new Store(dir);
  assert.equal(copy.data.settings.theme, 'rose');
  assert.deepEqual(copy.public().keys, ['ai']);
  assert.equal(copy.public().files[0].path, undefined);
  assert.equal(copy.public().secrets, undefined);
  assert.ok(copy.data.routines[0].blocks.length);
});
test('graph branches, bounded repetitions and saved node positions', async () => {
  const spec = {
    name: 'Проверка',
    blocks: [
      { kind: 'switchTheme', value: 'cream', next: 1, alternate: 3, x: 44, y: 80 },
      { kind: 'note', value: 'запись' },
      { kind: 'repeat', value: '3', alternate: 1, next: 4 },
      { kind: 'say', value: 'другое' },
    ],
  };
  assert.equal(routine(spec).blocks[0].x, 44);
  for (const [condition, expected] of [
    [true, ['запись', 'запись', 'запись']],
    [false, ['другое']],
  ]) {
    const calls = [];
    await runRoutine(spec, (b) => (b.kind === 'switchTheme' ? condition : calls.push(b.value)));
    assert.deepEqual(calls, expected);
  }
  await assert.rejects(
    runRoutine({ name: 'Цикл', blocks: [{ kind: 'note', value: 'x', next: 0 }] }, () => {}),
    /число шагов/,
  );
  assert.throws(() => routine({ name: 'X', blocks: [{ kind: 'note', next: 9 }] }), /Связь/);
});
test('model download resumes at the saved offset and verifies the entire file', async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, 'model.gguf'),
    data = Buffer.from('GGUF test contents with a pinned digest');
  const hash = createHash('sha256').update(data).digest('hex');
  let requested;
  const url = await serve(t, (req, res) => {
    requested = req.headers.range;
    const start = Number(requested?.match(/\d+/)?.[0] || 0);
    if (start) {
      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + (data.length - 1) + '/' + data.length,
      });
    }
    res.end(data.subarray(start));
  });
  await writeFile(file + '.part', data.subarray(0, 8));
  await download({ bytes: data.length, url, hash }, file, new AbortController().signal, () => {});
  assert.equal(requested, 'bytes=8-');
  assert.deepEqual(await readFile(file), data);
  await assert.rejects(
    download(
      { bytes: data.length, url, hash: 'invalid' },
      file + '2',
      new AbortController().signal,
      () => {},
    ),
    /сумма/,
  );
  await assert.rejects(stat(file + '2.part'), { code: 'ENOENT' });
});
test('MCP negotiates a session, lists and calls tools, then closes the session', async (t) => {
  const log = [];
  const url = await serve(t, async (req, res) => {
    if (req.method === 'DELETE') {
      log.push('delete');
      res.writeHead(204);
      res.end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const msg = JSON.parse(Buffer.concat(chunks));
    log.push(msg.method);
    if (msg.method !== 'initialize') assert.equal(req.headers['mcp-session-id'], 'local-session');
    if (msg.method === 'notifications/initialized') {
      res.writeHead(202);
      res.end();
      return;
    }
    const result =
      msg.method === 'initialize'
        ? { protocolVersion: '2025-03-26', capabilities: { tools: {} } }
        : msg.method === 'tools/list'
          ? { tools: [{ name: 'sum' }] }
          : { content: [{ type: 'text', text: String(msg.params.arguments.a + 2) }] };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'local-session' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
  });
  assert.equal((await mcp({ url }, 'tools/list', {})).tools[0].name, 'sum');
  assert.equal(
    (await mcp({ url }, 'tools/call', { name: 'sum', arguments: { a: 3 } })).content[0].text,
    '5',
  );
  assert.equal(log.filter((x) => x === 'delete').length, 2);
  assert.throws(() => endpoint('http://external.test'), /HTTPS/);
  assert.throws(() => endpoint('https://a:b@example.test'), /HTTP/);
});
test('user catalog and model tool selection use actual HTTP responses', async (t) => {
  const { community, selectTool } = require('../network.cjs');
  const server = await serve(t, async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      res.end(JSON.stringify({ packs: [{ id: 'kit', name: 'Работа', routines: [{ kind: 'note' }] }] }));
      return;
    }
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const payload = JSON.parse(Buffer.concat(chunks));
    assert.equal(payload.tools[0].function.name, 'agenda');
    res.end(
      JSON.stringify({
        choices: [
          { message: { tool_calls: [{ function: { name: 'agenda', arguments: '{"day":"today"}' } }] } },
        ],
      }),
    );
  });
  assert.equal((await community(server))[0].name, 'Работа');
  assert.deepEqual(
    await selectTool(server, '', 'local', [{ role: 'user', content: 'покажи план' }], [{ name: 'agenda' }]),
    { name: 'agenda', args: { day: 'today' } },
  );
});
