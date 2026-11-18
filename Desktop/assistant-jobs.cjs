const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const roles = {
  research: 'Prepare a sourced summary using the excerpts supplied, or state when sources are unavailable.',
  writer: 'Write and revise a clear document for the user.',
  analyst: 'Analyze the supplied problem. Explain your reasoning briefly and state uncertainty.',
};
class AssistantJobs {
  constructor(data, save, notify, execute) {
    Object.assign(this, { data, save, notify, execute });
    this.active = null;
    data.assistantJobs ??= [];
    const unfinished = data.assistantJobs.filter((j) => ['queued', 'running'].includes(j.status));
    for (const j of unfinished) j.status = 'interrupted';
    if (unfinished.length) this.save();
  }
  list() {
    return this.data.assistantJobs;
  }
  change() {
    this.save();
    this.notify();
  }
  add(role, prompt) {
    prompt = String(prompt || '').trim();
    if (!prompt || prompt.length > 12000 || (!Object.hasOwn(roles, role) && role !== 'image'))
      throw Error('Проверь задание помощника');
    if (this.list().filter((j) => ['queued', 'running'].includes(j.status)).length >= 8)
      throw Error('Очередь заданий заполнена');
    const job = { id: randomUUID(), role, prompt, status: 'queued', created: Date.now() };
    this.list().unshift(job);
    this.change();
    void this.next();
    return job.id;
  }
  cancel(id) {
    const j = this.list().find((x) => x.id === id);
    if (!j || !['queued', 'running'].includes(j.status)) return;
    j.status = 'cancelled';
    if (this.active?.id === id) this.active.controller.abort();
    this.change();
  }
  async next() {
    if (this.active) return;
    const j = this.list().findLast((x) => x.status === 'queued');
    if (!j) return;
    const controller = new AbortController();
    this.active = { id: j.id, controller };
    j.status = 'running';
    this.change();
    try {
      const text = await this.execute(j, controller.signal);
      if (j.status === 'running') {
        j.result = text;
        j.status = 'done';
      }
    } catch (e) {
      if (j.status === 'running') {
        j.error = e.message;
        j.status = 'error';
      }
    } finally {
      this.active = null;
      this.change();
      void this.next();
    }
  }
}
async function generateImage({ id, prompt }, dir, key, signal, fetcher = fetch) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Error('Недопустимый идентификатор изображения');
  if (!key) throw Error('Добавь ключ OpenAI для генерации изображений');
  const r = await fetcher('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1024x1024', output_format: 'png' }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(240000)]),
  });
  if (!r.ok) throw Error('OpenAI Images HTTP ' + r.status);
  const encoded = (await r.json()).data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || encoded.length > 40 * 1024 * 1024)
    throw Error('Сервис не вернул изображение PNG');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    throw Error('Недопустимое изображение');
  signal.throwIfAborted();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id + '.png'), bytes, { flag: 'wx' });
  return id;
}
module.exports = { AssistantJobs, generateImage, roles };
