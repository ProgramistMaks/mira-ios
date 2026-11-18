const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { streamText } = require('../chat-stream.cjs');
function split(text) {
  const bytes = Buffer.from(text);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.subarray(i, i + 3));
        c.close();
      },
    }),
  );
}
test('SSE survives split UTF-8 characters and CRLF while excluding private reasoning deltas', async () => {
  const body = [
    ': ping',
    '',
    ...['reasoning_content', 'content', 'content'].flatMap((key, i) => [
      'data: ' + JSON.stringify({ choices: [{ delta: { [key]: ['ignored', 'При', 'вет'][i] } }] }),
      '',
    ]),
    'data: [DONE]',
    '',
    '',
  ].join('\r\n');
  const values = [];
  assert.equal(await streamText(split(body), 'openai', (x) => values.push(x)), 'Привет');
  assert.deepEqual(values, ['При', 'Привет']);
});
test('Anthropic text deltas complete only at message_stop; truncated or errored streams reject', async () => {
  const part =
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Да"}}\n\n';
  await assert.rejects(
    streamText(split(part), 'anthropic', () => {}),
    /прервалось/,
  );
  assert.equal(
    await streamText(split(part + 'data: {"type":"message_stop"}\n\n'), 'anthropic', () => {}),
    'Да',
  );
  await assert.rejects(
    streamText(split('data: {"error":{"message":"busy"}}\n\n'), 'openai', () => {}),
    /busy/,
  );
});
test('a compatible service which explicitly rejects streaming can still return an ordinary answer', async () => {
  const http = require('node:http'),
    { ai } = require('../network.cjs'),
    modes = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    modes.push(body.stream);
    res.writeHead(body.stream ? 422 : 200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        body.stream ? { error: 'stream is not supported' } : { choices: [{ message: { content: 'ответ' } }] },
      ),
    );
  });
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    assert.equal(
      await ai(
        'http://127.0.0.1:' + server.address().port + '/v1',
        '',
        'demo',
        [{ role: 'user', content: 'Привет' }],
        new AbortController().signal,
        {},
        () => {},
      ),
      'ответ',
    );
    assert.deepEqual(modes, [true, false]);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
