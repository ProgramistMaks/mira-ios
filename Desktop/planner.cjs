const { routine, normal } = require('./core.cjs');
const descriptions = {
  focus: ['таймер фокуса в минутах', /фокус|уч[её]б|таймер|помодоро/iu],
  wait: ['пауза в секундах', /подожд|пауза|задержк|через \d/iu],
  note: ['текст заметки', /запиши|заметк|записать/iu],
  task: ['текст задачи', /задач/iu],
  say: ['текст, который нужно произнести', /скажи|произнес|вслух|озвуч/iu],
  notify: ['текст уведомления', /уведом|напомн/iu],
  url: ['полный адрес сайта', /https?:|сайт|ютуб|youtube|браузер/iu],
  file: ['ID добавленного файла', /файл|программ|приложени/iu],
  dance: ['', /тан[це]|танцуй/iu],
  search: ['поисковый запрос', /найди|поищи|поиск/iu],
  theme: ['cream, night, sage или rose', /тем[ау]|оформлен/iu],
  music: ['', /музык|плейлист/iu],
  ifTime: ['диапазон часов 09-18', /если.{0,20}(?:время|час|утро|вечер)/iu],
  switchTheme: ['тема для проверки', /если.{0,20}тем/iu],
  processRunning: ['имя проверяемого процесса', /если.{0,40}(?:запущ|открыт)|процесс/iu],
  repeat: ['число повторов и alternate на начало', /повтор|цикл/iu],
  clipboardAI: ['инструкция для обработки текста', /буфер|скопированный текст/iu],
  meeting: ['', /ближайш.{0,10}встреч|созвон/iu],
  quiet: ['on или off', /не беспокоить|тихий режим/iu],
  closeWindow: ['имя процесса, окно которого нужно закрыть', /закр(?:ой|ыть) окн/iu],
  shutdownTimer: ['минуты до выключения', /выключени[ея] (?:пк|компьютер)|выключи (?:пк|компьютер)/iu],
  cancelShutdown: ['', /отмени.{0,15}выключени/iu],
};
const kinds = Object.keys(descriptions);
function scenarioSchema(allowed, branching) {
  const properties = { kind: { type: 'string', enum: allowed }, value: { type: 'string' } };
  if (branching) {
    properties.next = { type: 'integer', minimum: 0, maximum: 18 };
    properties.alternate = { ...properties.next };
  }
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      phrase: { type: 'string' },
      blocks: {
        type: 'array',
        minItems: 1,
        maxItems: 18,
        items: { type: 'object', properties, required: ['kind', 'value'], additionalProperties: false },
      },
    },
    required: ['name', 'phrase', 'blocks'],
    additionalProperties: false,
  };
}
const weekday = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
function calendarPhrase(text, now = new Date()) {
  const m = text.match(
    /^напомни\s+(каждый день|ежедневно|каждую неделю|(?:в|во) (?:воскресенье|понедельник|вторник|среду|четверг|пятницу|субботу)|(?:каждую|каждый) (?:воскресенье|понедельник|вторник|среду|четверг|пятницу|субботу))\s+в\s+(\d{1,2})(?:[:.]([0-5]\d))?[,: ]+(.+)/iu,
  );
  if (!m) return;
  if (+m[2] > 23) throw Error('Укажи час от 0 до 23');
  const date = new Date(now);
  date.setHours(+m[2], +(m[3] || 0), 0, 0);
  const rule = normal(m[1]),
    day = weekday.indexOf(rule.split(' ').at(-1));
  let repeat = '';
  if (day >= 0) {
    let days = (day - now.getDay() + 7) % 7;
    if (!days && date <= now) days = 7;
    date.setDate(date.getDate() + days);
    if (rule.startsWith('кажд')) repeat = 'week';
  } else {
    repeat = rule.includes('недел') ? 'week' : 'day';
    if (date <= now) date.setDate(date.getDate() + (repeat === 'day' ? 1 : 7));
  }
  return { time: date.getTime(), repeat, text: m[4] };
}
function nextDue(time, repeat, now) {
  const date = new Date(time),
    step = repeat === 'day' ? 1 : 7;
  const estimate = Math.max(1, Math.floor((now - time) / (step * 86400000)));
  date.setDate(date.getDate() + estimate * step);
  while (+date <= now) date.setDate(date.getDate() + step);
  return +date;
}
function readRequest(input) {
  const text = String(input || '')
      .trim()
      .slice(0, 4000),
    match = text.match(/^(?:«([^»]+)»|"([^"]+)"|([^:]{1,70})):?\s*[:—–]\s*(.+)$/su);
  return match
    ? { name: (match[1] || match[2] || match[3]).trim(), steps: match[4] }
    : { name: 'Моя команда', steps: text };
}
function offlineStep(part) {
  const simple = [
    [/^(?:включи |запусти |поставь )?(?:фокус|таймер|режим уч[её]бы)(?: на)?\s*(\d{1,3})/iu, 'focus'],
    [/^подожди\s+(\d+)/iu, 'wait'],
    [/^(?:запиши(?: заметку)?|заметка)\s+(.+)/iu, 'note'],
    [/^(?:добавь задачу|задача)\s+(.+)/iu, 'task'],
    [/^(?:скажи|произнеси)\s+(.+)/iu, 'say'],
    [/^(?:уведоми|покажи уведомление)\s+(.+)/iu, 'notify'],
    [/^(?:найди(?: в интернете)?|поищи)\s+(.+)/iu, 'search'],
  ];
  for (const [rx, kind] of simple) {
    const m = part.match(rx);
    if (m) return { kind, value: m[1] };
  }
  if (/^(?:потанцуй|танцуй)$/iu.test(part)) return { kind: 'dance', value: '' };
  if (/^(?:включи|запусти) музыку$/iu.test(part)) return { kind: 'music', value: '' };
  const m = part.match(/^открой\s+(.+)$/iu);
  if (m) {
    const url =
      {
        ютуб: 'https://www.youtube.com/',
        youtube: 'https://www.youtube.com/',
        гугл: 'https://www.google.com/',
      }[normal(m[1])] || m[1];
    if (/^https?:\/\//i.test(url)) return { kind: 'url', value: url };
  }
  return null;
}
async function plan(input, ask, files) {
  const { name, steps } = readRequest(input);
  if (!steps) throw Error('Опиши действия команды');
  const parts = steps
    .split(
      /\s*(?:[;\n]+|,\s*(?:затем |потом |и )?|\s+(?:затем|потом|и (?=запиши|добавь|включи|открой|скажи|поставь|подожди|потанцуй))\s*)/iu,
    )
    .filter(Boolean);
  const blocks = parts.map((p) => offlineStep(p.trim().replace(/[.!]$/u, '')));
  if (blocks.length && blocks.every(Boolean))
    return routine({ name, phrase: name === 'Моя команда' ? '' : name, blocks });
  const matches = kinds.filter((k) => descriptions[k][1].test(steps));
  const allowed = matches.length
    ? matches
    : kinds.filter((k) => !['closeWindow', 'shutdownTimer', 'cancelShutdown', 'clipboardAI'].includes(k));
  const branching = allowed.some((k) => ['ifTime', 'switchTheme', 'processRunning', 'repeat'].includes(k));
  const schema = scenarioSchema(allowed, branching);
  const messages = [
    {
      role: 'system',
      content:
        'Составь сценарий Миры из запроса на русском. Только JSON {name,phrase,blocks:[{kind,value}]}. Действия: ' +
        allowed.map((k) => k + ' = ' + descriptions[k][0]).join('; ') +
        '. notify выводит уведомление, say произносит текст, note сохраняет заметку, task создаёт задачу, focus — минуты, wait — секунды. Для линейных шагов указывай только kind и value. У веток next/alternate — индексы блоков с нуля. theme: cream/night/sage/rose. Для file разрешены только эти идентификаторы: ' +
        JSON.stringify(files.map((f) => ({ id: f.id, name: f.name }))) +
        '. Для url только абсолютный HTTP(S).',
    },
    { role: 'user', content: input },
  ];
  for (let round = 0; round < 2; round++) {
    const raw = await ask(messages, schema);
    try {
      return parseDraft(raw, allowed, files, name, steps);
    } catch (e) {
      if (round) throw e;
      messages.push(
        { role: 'assistant', content: raw.slice(0, 3500) },
        {
          role: 'user',
          content: 'Исправь JSON по замечанию: ' + e.message + '. Только запрошенные действия.',
        },
      );
    }
  }
}
function parseDraft(raw, allowed, files, name, steps) {
  const block = raw
    .trim()
    .replace(/^\x60{3}(?:json)?\s*|\x60{3}$/gi, '')
    .trim();
  let data;
  try {
    data = JSON.parse(block);
  } catch {
    throw Error('Модель не вернула сценарий. Уточни действия.');
  }
  if (
    !Array.isArray(data.blocks) ||
    !data.blocks.every(
      (b) => b && allowed.includes(b.kind) && (b.kind !== 'file' || files.some((f) => f.id === b.value)),
    )
  )
    throw Error('Модель предложила недоступное действие');
  let blocks = data.blocks;
  if (
    !/дважды|трижды|повтор|раза|раз подряд/iu.test(steps) &&
    blocks.every((b) => b.next === undefined && b.alternate === undefined)
  ) {
    blocks = blocks.filter(
      (b, i) => i === 0 || b.kind !== data.blocks[i - 1].kind || b.value !== data.blocks[i - 1].value,
    );
  }
  return routine({ name: data.name || name, phrase: data.phrase || '', blocks });
}
module.exports = { plan, calendarPhrase, nextDue };
