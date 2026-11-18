const { endpoint, webURL } = require('./core.cjs');
const { streamText } = require('./chat-stream.cjs');
async function response(url, options = {}, timeout = 25000, fetcher = fetch) {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  const r = await fetcher(url, { ...options, signal });
  if (!r.ok) throw Error('Сервис вернул ' + r.status + ' (' + new URL(url).hostname + ')');
  return r;
}
const post = (body, key) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
  body: JSON.stringify(body),
});
async function chatFetch(url, options) {
  const r = await fetch(url, options);
  if (![400, 422, 501].includes(r.status)) return r;
  const body = JSON.parse(options.body);
  if (!body.stream) return r;
  const detail = (await r.clone().text()).slice(0, 2000);
  if (
    !/stream/i.test(detail) ||
    !/unsupported|not (?:supported|available|allowed)|unrecognized|unknown|must be false|disabled|не поддерж/iu.test(
      detail,
    )
  )
    return r;
  await r.body?.cancel();
  return fetch(url, { ...options, body: JSON.stringify({ ...body, stream: false }) });
}
async function ai(base, key, model, messages, signal, localOptions = {}, onText) {
  if (new URL(endpoint(base)).hostname === 'api.anthropic.com') {
    const r = await response(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          ...(onText ? { stream: true } : {}),
          system: messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join('\n'),
          messages: messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({
              ...m,
              content: Array.isArray(m.content)
                ? m.content.map((p) =>
                    p.type === 'image_url'
                      ? {
                          type: 'image',
                          source: {
                            type: 'base64',
                            media_type: 'image/jpeg',
                            data: p.image_url.url.slice(23),
                          },
                        }
                      : p,
                  )
                : m.content,
            })),
        }),
        signal,
      },
      180000,
      chatFetch,
    );
    if (onText && r.headers.get('content-type')?.includes('text/event-stream'))
      return streamText(r, 'anthropic', onText, signal);
    const text = (await r.json()).content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    if (!text) throw Error('Модель вернула пустой ответ');
    return text;
  }
  const r = await response(
    endpoint(base) + '/chat/completions',
    { ...post({ model, messages, stream: !!onText, ...localOptions }, key), signal },
    180000,
    chatFetch,
  );
  if (onText && r.headers.get('content-type')?.includes('text/event-stream'))
    return streamText(r, 'openai', onText, signal);
  const data = await r.json(),
    text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw Error('Модель вернула пустой ответ');
  return text.trim();
}
async function selectTool(base, key, model, messages, tools, signal) {
  const available = tools
    .filter((t) => typeof t.name === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(t.name))
    .slice(0, 64);
  if (!available.length) throw Error('Сервер не предлагает совместимых инструментов');
  const request = available.map((t) => ({
    name: t.name,
    description: String(t.description || '').slice(0, 1500),
    parameters: t.inputSchema || { type: 'object', properties: {} },
  }));
  let name, args;
  if (new URL(endpoint(base)).hostname === 'api.anthropic.com') {
    const r = await response(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          messages: messages.filter((m) => m.role !== 'system'),
          tools: request.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
          })),
          tool_choice: { type: 'any' },
        }),
        signal,
      },
      120000,
    );
    const call = (await r.json()).content?.find((c) => c.type === 'tool_use');
    name = call?.name;
    args = call?.input;
  } else {
    const r = await response(
      endpoint(base) + '/chat/completions',
      {
        ...post(
          {
            model,
            messages,
            tools: request.map((fn) => ({ type: 'function', function: fn })),
            tool_choice: 'auto',
            stream: false,
          },
          key,
        ),
        signal,
      },
      120000,
    );
    const message = (await r.json()).choices?.[0]?.message,
      fn = message?.tool_calls?.[0]?.function;
    if (!fn && message?.content) return { text: message.content };
    name = fn?.name;
    args = JSON.parse(fn?.arguments || '{}');
  }
  if (!available.some((t) => t.name === name) || !args || Array.isArray(args) || typeof args !== 'object')
    throw Error('Модель не смогла выбрать инструмент');
  return { name, args };
}
async function community(url) {
  const r = await response(endpoint(url));
  const chunks = [];
  let n = 0;
  for await (const part of r.body) {
    n += part.length;
    if (n > 512000) throw Error('Каталог превышает 500 КБ');
    chunks.push(part);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(body.packs) || body.packs.length > 60)
    throw Error('Нужен каталог JSON с массивом packs, максимум 60 наборов');
  return body.packs.filter(
    (p) =>
      p &&
      typeof p.name === 'string' &&
      ((Array.isArray(p.routines) && p.routines.length && p.routines.length <= 30) ||
        (p.contributions && typeof p.contributions === 'object')),
  );
}
function plain(s) {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
function webQuery(text) {
  const match = String(text)
    .trim()
    .match(
      /^(?:(?:пожалуйста[, ]+)?(?:найди|поищи|поиск)(?:\s+в\s+(?:интернете|сети))?|(?:посмотри|проверь|поищи|найди|можешь\s+(?:найти|посмотреть|проверить))\s+в\s+(?:интернете|сети))[, :]+(?:пожалуйста[, ]+)?(.+)/isu,
    );
  return match?.[1]?.trim() || '';
}
async function search(query, key, signal, fetcher = fetch, fallback = true) {
  const request = (url, options, timeout) => response(url, { ...options, signal }, timeout, fetcher);
  if (key) {
    try {
      const d = await (
        await request('https://api.tavily.com/search', post({ query, max_results: 5 }, key), 12000)
      ).json();
      const items = (d.results || []).map((x) => ({ title: x.title, url: webURL(x.url), text: x.content }));
      if (items.length || !fallback) return items;
    } catch (e) {
      if (signal?.aborted || !fallback) throw e;
    }
  }
  const du = new URL('https://lite.duckduckgo.com/lite/');
  du.searchParams.set('q', query);
  try {
    const html = await (await request(du, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 12000)).text(),
      results = [];
    const anchors = [...html.matchAll(/<a\b([^>]*\bclass=['"]result-link['"][^>]*)>([\s\S]*?)<\/a>/gi)];
    for (let i = 0; i < anchors.length && results.length < 5; i++) {
      const a = anchors[i],
        href = a[1].match(/\bhref=['"]([^'"]+)['"]/i)?.[1];
      if (!href) continue;
      const link = new URL(plain(href), du),
        target = link.hostname.endsWith('duckduckgo.com') ? link.searchParams.get('uddg') : link.href;
      if (!target || !/^https?:\/\//i.test(target)) continue;
      const following = html.slice(a.index + a[0].length, anchors[i + 1]?.index);
      const snippet = following.match(/<td[^>]+class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i);
      results.push({ title: plain(a[2]), url: webURL(target), text: snippet ? plain(snippet[1]) : '' });
    }
    if (results.length) return results;
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('format', 'rss');
  url.searchParams.set('q', query);
  const xml = await (await request(url)).text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const get = (t) =>
        plain((m[1].match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>')) || [])[1] || '');
      return { title: get('title'), url: get('link'), text: get('description') };
    })
    .filter((x) => /^https?:\/\//.test(x.url))
    .slice(0, 5);
  if (!items.length) throw Error('Поиск не вернул результатов. Можно подключить Tavily во вкладке «ИИ»');
  return items;
}
async function weather(city) {
  const g = new URL('https://geocoding-api.open-meteo.com/v1/search');
  g.search = new URLSearchParams({ name: city, count: '1', language: 'ru' });
  const loc = (await (await response(g)).json()).results?.[0];
  if (!loc) throw Error('Город не найден');
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: loc.latitude,
    longitude: loc.longitude,
    current: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max',
    forecast_days: '3',
    timezone: 'auto',
  });
  const d = await (await response(u)).json();
  return {
    city: loc.name,
    temp: d.current.temperature_2m,
    code: d.current.weather_code,
    days: d.daily.temperature_2m_max,
  };
}
async function rates() {
  const d = await (await response('https://www.cbr-xml-daily.ru/daily_json.js')).json();
  return {
    date: d.Date,
    RUB: 1,
    ...Object.fromEntries(['USD', 'EUR', 'CNY'].map((k) => [k, d.Valute[k].Value / d.Valute[k].Nominal])),
  };
}
const fishModelId = /^[a-f0-9]{32}$/i;
function sampleUrl(sample) {
  if (fishModelId.test(sample?.task_id))
    return 'https://platform.r2.fish.audio/task/' + sample.task_id + '.mp3';
  const value = sample?.audio;
  try {
    const u = new URL(value);
    if (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === 'fish.audio' || u.hostname.endsWith('.fish.audio'))
    )
      return u.href;
  } catch {}
  return '';
}
async function fishVoices(query = '', page = 1, fetcher = fetch) {
  const url = new URL('https://api.fish.audio/model');
  const size = 12;
  url.search = new URLSearchParams({
    title: String(query).trim().slice(0, 120),
    type: 'tts',
    page_number: String(Math.max(1, Math.min(100, Math.trunc(page) || 1))),
    page_size: String(size),
  });
  const data = await (await response(url, {}, 12000, fetcher)).json();
  if (!Array.isArray(data.items)) throw Error('Библиотека голосов вернула неизвестный ответ');
  const items = data.items
    .filter(
      (x) =>
        fishModelId.test(x._id) &&
        x.title &&
        !x.dmca_taken_down &&
        x.visibility === 'public' &&
        x.state === 'trained',
    )
    .map((x) => ({
      id: x._id,
      title: String(x.title).trim().slice(0, 120),
      author: String(x.author?.nickname || '').slice(0, 110),
      languages: (x.languages || []).slice(0, 6).join(', ').toUpperCase(),
      sample: (x.samples || []).some(sampleUrl),
      cover: x.cover_image === 'coverimage/' + x._id,
    }));
  return { items, more: data.has_more ?? data.items.length === size };
}
async function audioBytes(res, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > limit) throw Error('Аудиофайл слишком большой');
    chunks.push(chunk);
  }
  if (size < 32) throw Error('Сервис вернул пустой аудиофайл');
  return Buffer.concat(chunks);
}
async function fishSample(id, signal, fetcher = fetch) {
  if (!fishModelId.test(id)) throw Error('Неизвестный голос Fish Audio');
  const model = await (
    await response('https://api.fish.audio/model/' + id, { signal }, 12000, fetcher)
  ).json();
  if (model._id !== id || model.visibility !== 'public' || model.dmca_taken_down)
    throw Error('Голос недоступен в каталоге');
  const url = (model.samples || []).map(sampleUrl).find(Boolean);
  if (!url) throw Error('У этого голоса нет опубликованного примера');
  return audioBytes(await response(url, { signal, redirect: 'error' }, 20000, fetcher), 12 * 1024 * 1024);
}
async function fishSpeech(key, id, text, signal, fetcher = fetch) {
  if (!key || !fishModelId.test(id))
    throw Error('Для ответов этим голосом укажи ключ Fish Audio и выбери голос');
  const res = await response(
    'https://api.fish.audio/v1/tts',
    {
      ...post(
        { text: String(text).slice(0, 6000), reference_id: id, format: 'wav', sample_rate: 24000 },
        key,
      ),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, model: 's2-pro' },
      redirect: 'error',
      signal,
    },
    120000,
    fetcher,
  );
  return audioBytes(res, 32 * 1024 * 1024);
}
async function mcp(config, method, params, signal) {
  const base = endpoint(config.url),
    headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(config.token ? { Authorization: 'Bearer ' + config.token } : {}),
    };
  let seq = 0;
  async function rpc(name, args, notification = false) {
    const payload = { jsonrpc: '2.0', method: name, params: args, ...(notification ? {} : { id: ++seq }) };
    const r = await response(base, { method: 'POST', headers, body: JSON.stringify(payload), signal });
    const session = r.headers.get('mcp-session-id');
    if (session) headers['Mcp-Session-Id'] = session;
    if (notification) return;
    const type = r.headers.get('content-type') || '';
    let d;
    if (type.includes('text/event-stream')) {
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      let buf = '';
      try {
        while (!d) {
          const part = await reader.read();
          if (part.done) break;
          buf += decoder.decode(part.value, { stream: true });
          if (buf.length > 2e6) throw Error('Слишком большой ответ MCP');
          const packets = buf.split(/\r?\n\r?\n/);
          buf = packets.pop();
          for (const packet of packets) {
            const data = packet
              .split(/\r?\n/)
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trim())
              .join('\n');
            if (data) {
              const msg = JSON.parse(data);
              if (msg.id === payload.id) d = msg;
            }
          }
        }
      } finally {
        await reader.cancel();
      }
    } else d = await r.json();
    if (!d || d.error) throw Error(d?.error?.message || 'Пустой ответ MCP');
    return d.result;
  }
  const init = await rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'mira-desktop', version: require('./package.json').version },
  });
  headers['MCP-Protocol-Version'] = init.protocolVersion;
  try {
    await rpc('notifications/initialized', {}, true);
    return await rpc(method, params);
  } finally {
    if (headers['Mcp-Session-Id'])
      await fetch(base, { method: 'DELETE', headers, signal: AbortSignal.timeout(2500) }).catch(() => {});
  }
}
module.exports = {
  response,
  post,
  ai,
  selectTool,
  community,
  search,
  webQuery,
  weather,
  rates,
  fishSpeech,
  fishVoices,
  fishSample,
  mcp,
};
