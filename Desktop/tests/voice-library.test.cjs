const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('../network.cjs');
test('a paid reply sends the chosen model id and turn text to Fish TTS; public previews never use the TTS key', async () => {
  const id = '1'.repeat(32),
    sample = 'https://platform.r2.fish.audio/task/example.mp3',
    data = Buffer.alloc(100, 1),
    requests = [];
  const fetcher = async (url, o) => {
    requests.push([String(url), o]);
    return String(url).includes('/model/')
      ? Response.json({ _id: id, visibility: 'public', samples: [{ audio: sample }] })
      : new Response(data);
  };
  assert.deepEqual(await net.fishSample(id, undefined, fetcher), data);
  assert.deepEqual(
    requests.map(([, o]) => o.headers?.Authorization),
    [undefined, undefined],
  );
  assert.deepEqual(await net.fishSpeech('test-only', id, 'Привет!', undefined, fetcher), data);
  const [url, opts] = requests.at(-1);
  assert.equal(url, 'https://api.fish.audio/v1/tts');
  assert.equal(opts.headers.Authorization, 'Bearer test-only');
  assert.equal(JSON.parse(opts.body).reference_id, id);
  assert.equal(JSON.parse(opts.body).text, 'Привет!');
  await assert.rejects(net.fishSpeech('', id, 'Привет!', undefined, fetcher), /ключ/u);
});
test('Russian web requests strip the action from the query and respect optional fallback', async () => {
  assert.equal(net.webQuery('Посмотри в интернете, пожалуйста, когда полнолуние?'), 'когда полнолуние?');
  assert.equal(net.webQuery('Поищи в сети новости космоса'), 'новости космоса');
  assert.equal(net.webQuery('Прочитай мои заметки'), '');
  const queries = [];
  const fake = async (url, options) => {
    const u = new URL(url);
    queries.push([u.hostname, options.headers?.Authorization]);
    return u.hostname === 'api.tavily.com'
      ? new Response('', { status: 429 })
      : new Response('<a href="https://example.org/" class="result-link">Пример</a>');
  };
  assert.equal((await net.search('тест', 'demo', undefined, fake))[0].title, 'Пример');
  assert.deepEqual(queries, [
    ['api.tavily.com', 'Bearer demo'],
    ['lite.duckduckgo.com', undefined],
  ]);
  await assert.rejects(net.search('тест', 'demo', undefined, fake, false), /429/);
});
