const { endpoint } = require('./core.cjs');
async function request(config, key, route, body, signal, headers = {}) {
  const result = await fetch(endpoint(config.base) + '/audio/' + route, {
    method: 'POST',
    redirect: 'error',
    headers: { ...headers, ...(key ? { Authorization: 'Bearer ' + key } : {}) },
    body,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
  });
  if (!result.ok) throw Error('Голосовой сервис вернул ' + result.status);
  return result;
}
async function transcribe(config, key, bytes, signal) {
  const wav = Buffer.from(bytes);
  if (
    wav.length < 44 ||
    wav.length > 32 * 1024 * 1024 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw Error('Неподходящая запись');
  const form = new FormData();
  form.set('file', new Blob([wav], { type: 'audio/wav' }), 'voice.wav');
  form.set('model', config.sttModel);
  form.set('language', 'ru');
  const body = await (await request(config, key, 'transcriptions', form, signal)).json();
  if (typeof body.text !== 'string') throw Error('Пустой результат распознавания');
  return body.text.trim();
}
async function speak(config, key, input, signal) {
  const res = await request(
    config,
    key,
    'speech',
    JSON.stringify({
      model: config.ttsModel,
      voice: config.voice || 'alloy',
      input: String(input).slice(0, 6000),
      response_format: 'wav',
    }),
    signal,
    { 'Content-Type': 'application/json' },
  );
  const chunks = [];
  let size = 0;
  for await (const part of res.body) {
    size += part.length;
    if (size > 32 * 1024 * 1024) throw Error('Аудиоответ слишком большой');
    chunks.push(part);
  }
  if (size < 16) throw Error('Сервис вернул пустое аудио');
  return Buffer.concat(chunks);
}
module.exports = { transcribe, speak };
