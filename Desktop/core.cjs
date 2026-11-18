const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { widgetSize } = require('./ui/widget-size.mjs');

function webURL(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw Error('Нужна ссылка HTTP или HTTPS');
  return u.href;
}
function endpoint(value) {
  const u = new URL(webURL(value));
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
    throw Error('Для внешнего сервиса нужен HTTPS');
  return u.href.replace(/\/$/, '');
}
const normal = (s) =>
  String(s)
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/[.!?,]+$/u, '')
    .trim();
const uid = () => randomUUID();
const widgetNames = {
  notes: 'Заметки',
  mail: 'Почта',
  tasks: 'Задачи',
  events: 'Календарь',
  clock: 'Дата и время',
  reminders: 'Напоминания',
  focus: 'Фокус',
  weather: 'Погода',
  rates: 'Курсы валют',
  music: 'Плеер',
  system: 'Система',
  crypto: 'Криптовалюта',
  launch: 'Быстрый запуск',
};
function widgetLayout(input) {
  const seen = new Set(),
    rows = [];
  for (const row of Array.isArray(input) ? input : []) {
    if (!Object.hasOwn(widgetNames, row?.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push({ id: row.id, visible: row.visible !== false, ...widgetSize(row.id, row.width, row.height) });
  }
  for (const id of Object.keys(widgetNames))
    if (!seen.has(id))
      rows.push({ id, visible: ['notes', 'tasks', 'events', 'clock', 'reminders', 'system'].includes(id) });
  return rows;
}
const defaults = () => ({
  settings: {
    name: 'Мира',
    user: '',
    role: 'Дружелюбный личный компаньон. Отвечай по-русски.',
    theme: 'cream',
    graphLines: 'round',
    allowTypos: true,
    phraseThreshold: 0.9,
    routineSeconds: 0,
    routineSteps: 0,
    routineRepeats: 0,
    widgets: widgetLayout(),
    island: false,
    islandPin: true,
    hideCapture: false,
    clipMemory: false,
    startHidden: false,
    startLogin: false,
    startListening: false,
    bubbles: true,
    ttsEnabled: true,
    speechRate: 1,
    speechVolume: 1,
    sensitivity: 0.012,
    microphoneId: '',
    speakerId: '',
    wakeWindow: 6,
    interruptReplies: true,
    silence: 0.78,
    degree: 'C',
    exchangeFrom: 'USD',
    exchangeTo: 'RUB',
    cryptoCoin: 'bitcoin',
    currency: 'usd',
    wakeAlias: '',
    accent: '',
    glow: 55,
    glass: false,
    disableBlur: false,
    windowButtonBackground: false,
    minimizeToTray: true,
    fps: 120,
    overlayHeight: 440,
    overlayAnchor: 'bottom-right',
    provider: 'local',
    model: 'qwen4',
    base: 'https://api.openai.com/v1',
    cloudModel: 'gpt-4o-mini',
    voice: 'builtin',
    stt: 'local',
    speechService: {
      base: 'https://api.openai.com/v1',
      ttsModel: 'tts-1',
      sttModel: 'whisper-1',
      voice: 'alloy',
    },
    systemVoice: '',
    fishVoice: '',
    fishVoiceName: '',
    fishPending: false,
    searchFallback: true,
    avatar: 'vita',
    outfit: 'original',
    showAvatar: false,
    introDone: false,
    city: 'Москва',
    reduced: false,
    hotkey: 'CommandOrControl+Alt+M',
  },
  chats: [],
  tasks: [],
  taskLists: [{ id: 'main', name: 'Мои задачи' }],
  activeTaskList: 'main',
  notes: [],
  events: [],
  routines: [
    {
      id: 'study-session',
      name: 'Рабочая сессия',
      phrase: 'начни рабочую сессию',
      hotkey: '',
      blocks: [
        { kind: 'focus', value: '25' },
        { kind: 'notify', value: 'Время сосредоточиться' },
        { kind: 'say', value: 'Таймер запущен. Я рядом.' },
      ],
    },
  ],
  files: [],
  commandGroups: [],
  avatars: [],
  voices: [],
  tools: [],
  extensions: [],
  focus: { ends: 0, remaining: 25 * 60000 },
  secrets: {},
  pairedChat: '',
  telegramOffset: 0,
  music: null,
});
class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'desk.json');
    const initial = defaults();
    const disk = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : {};
    this.data = {
      ...initial,
      ...disk,
      settings: {
        ...initial.settings,
        introDone: Boolean(disk.settings),
        ...(disk.settings ? { allowTypos: false, routineSteps: 160, routineRepeats: 10 } : {}),
        ...disk.settings,
        widgets: widgetLayout(disk.settings?.widgets),
      },
    };
    let migrated = false;
    for (const chat of this.data.chats)
      for (const message of chat.messages)
        if (!message.id) {
          message.id = uid();
          migrated = true;
        }
    if (migrated) this.save();
  }
  save() {
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
  public() {
    const { secrets, mailBoxes, mailIndex, telegramOffset, pairedChat, shelf, excludedDirs, ...state } =
      this.data;
    return {
      ...state,
      projects: (state.projects || []).map(({ root, ...p }) => ({
        ...p,
        folder: root ? path.basename(root) : '',
      })),
      excludedDirs: (excludedDirs || []).map(({ id, name }) => ({ id, name })),
      paired: Boolean(pairedChat),
      keys: Object.keys(secrets).filter((k) => Boolean(secrets[k])),
      files: state.files.map(({ id, name, kind }) => ({ id, name, kind })),
      voices: state.voices.map(({ id, name }) => ({ id, name })),
      avatars: state.avatars.map(({ id, name }) => ({ id, name })),
      music: state.music ? { name: state.music.name } : null,
    };
  }
}
const blockTypes = [
  'say',
  'note',
  'task',
  'focus',
  'wait',
  'url',
  'file',
  'search',
  'dance',
  'notify',
  'theme',
  'ifTime',
  'processRunning',
  'repeat',
  'switchTheme',
  'clipboardAI',
  'meeting',
  'quiet',
  'closeWindow',
  'shutdownTimer',
  'cancelShutdown',
  'paste',
  'keys',
  'music',
];
function routine(input) {
  if (!input || typeof input !== 'object' || !String(input.name ?? '').trim())
    throw Error('Введите название команды');
  if (!Array.isArray(input.blocks) || input.blocks.length < 1 || input.blocks.length > 64)
    throw Error('В команде должно быть от 1 до 64 блоков');
  const blocks = input.blocks.map((b, i) => {
    if (!blockTypes.includes(b.kind)) throw Error('Неизвестное действие');
    const value = String(b.value ?? '').slice(0, 4000);
    if (b.kind === 'url') webURL(value);
    if (
      ['processRunning', 'closeWindow'].includes(b.kind) &&
      !require('./process-running.cjs').validName(value)
    )
      throw Error('Укажи имя процесса');
    if (
      ['wait', 'focus', 'repeat'].includes(b.kind) &&
      (!Number.isInteger(+value) || +value < 1 || +value > { wait: 120, focus: 240, repeat: 10000 }[b.kind])
    )
      throw Error('Проверьте длительность или число повторов');
    if (b.kind === 'shutdownTimer' && (!Number.isInteger(+value) || +value < 1 || +value > 480))
      throw Error('Для таймера укажи от 1 до 480 минут');
    if (b.kind === 'quiet' && !['on', 'off'].includes(value)) throw Error('Выбери режим уведомлений');
    if (b.kind === 'clipboardAI' && !value.trim()) throw Error('Опиши, как изменить текст');
    const index = (key, fallback) => {
      if (b[key] === undefined || b[key] === '') return fallback;
      const n = Number(b[key]);
      if (!Number.isInteger(n) || n < 0 || n > input.blocks.length)
        throw Error('Связь ведёт к отсутствующему блоку');
      return n;
    };
    const next = index('next', i + 1),
      alternate = index('alternate', i + 1);
    if (b.kind === 'repeat' && alternate >= i) throw Error('Для повтора выберите предыдущий блок');
    if (b.kind === 'ifTime' && !/^([01]\d|2[0-3])-([01]\d|2[0-3])$/.test(value))
      throw Error('Введите диапазон часов, например 09-18');
    if (b.kind === 'keys' && !['copy', 'paste', 'undo', 'save', 'find', 'selectAll'].includes(value))
      throw Error('Неизвестное сочетание клавиш');
    const point =
      Number.isFinite(b.x) && Number.isFinite(b.y)
        ? {
            x: Math.round(Math.min(3200, Math.max(4, b.x))),
            y: Math.round(Math.min(2000, Math.max(4, b.y))),
          }
        : {};
    return { kind: b.kind, value, next, alternate, ...point };
  });
  return {
    id: String(input.id || uid()).slice(0, 90),
    name: String(input.name).trim().slice(0, 90),
    group: String(input.group || '')
      .trim()
      .slice(0, 60),
    phrase: String(input.phrase || '')
      .trim()
      .slice(0, 160),
    hotkey: String(input.hotkey || '')
      .trim()
      .slice(0, 80),
    blocks,
  };
}
async function runRoutine(input, perform, signal, limits = {}) {
  const spec = routine(input),
    repeats = new Map();
  let index = 0;
  for (let steps = 0; index < spec.blocks.length; steps++) {
    signal?.throwIfAborted();
    if (steps >= (limits.routineSteps || 10000))
      throw Error('Превышено число шагов. Проверьте связи в команде');
    if (steps && steps % 64 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
      signal?.throwIfAborted();
    }
    const b = spec.blocks[index];
    if (b.kind === 'repeat') {
      const count = repeats.get(index) || 1;
      if (count < +b.value) {
        if (count >= (limits.routineRepeats || 10000)) throw Error('Превышен лимит итераций цикла');
        repeats.set(index, count + 1);
        index = b.alternate;
        continue;
      }
      repeats.delete(index);
    } else if (b.kind === 'ifTime') {
      const [a, z] = b.value.split('-').map(Number),
        h = new Date().getHours();
      index = (a <= z ? h >= a && h < z : h >= a || h < z) ? b.next : b.alternate;
      continue;
    } else if (b.kind === 'switchTheme' || b.kind === 'processRunning') {
      index = (await perform(b, signal)) ? b.next : b.alternate;
      continue;
    } else await perform(b, signal);
    index = b.next;
  }
}
const templates = [
  {
    id: 'focus',
    name: 'Режим учёбы',
    phrase: 'режим учёбы',
    blocks: [
      { kind: 'focus', value: '25' },
      { kind: 'say', value: 'Начнём. У тебя двадцать пять минут на одно дело.' },
    ],
  },
  {
    id: 'break',
    name: 'Небольшая пауза',
    phrase: 'пора отдохнуть',
    blocks: [
      { kind: 'say', value: 'Давай встанем и немного разомнёмся.' },
      { kind: 'dance', value: '' },
    ],
  },
  {
    id: 'evening',
    name: 'Тихий вечер',
    phrase: 'тихий вечер',
    blocks: [
      { kind: 'theme', value: 'night' },
      { kind: 'notify', value: 'Вечерний режим включён' },
    ],
  },
  {
    id: 'video',
    name: 'Музыка для работы',
    phrase: 'музыка для работы',
    blocks: [{ kind: 'url', value: 'https://www.youtube.com/results?search_query=lofi+radio' }],
  },
  {
    id: 'translate',
    name: 'Перевод буфера обмена',
    phrase: 'переведи буфер',
    blocks: [{ kind: 'clipboardAI', value: 'Переведи на русский, сохрани абзацы.' }],
  },
  {
    id: 'rewrite',
    name: 'Редактор текста',
    phrase: 'отредактируй буфер',
    blocks: [{ kind: 'clipboardAI', value: 'Исправь ошибки и сделай текст яснее, сохрани смысл.' }],
  },
  {
    id: 'join-meeting',
    name: 'Ближайшая встреча',
    phrase: 'открой ближайшую встречу',
    blocks: [{ kind: 'meeting', value: '' }],
  },
  {
    id: 'cozy',
    name: 'Уютный режим',
    phrase: 'уютный режим',
    blocks: [
      { kind: 'theme', value: 'sage' },
      { kind: 'quiet', value: 'on' },
      { kind: 'music', value: '' },
    ],
  },
  {
    id: 'hydration',
    name: 'Перерыв на воду',
    phrase: 'пора попить воды',
    blocks: [
      { kind: 'notify', value: 'Стакан воды и минута отдыха' },
      { kind: 'dance', value: '' },
    ],
  },
  {
    id: 'power',
    name: 'Таймер выключения',
    phrase: 'таймер выключения',
    blocks: [{ kind: 'shutdownTimer', value: '30' }],
  },
  {
    id: 'power-cancel',
    name: 'Отмена выключения',
    phrase: 'отмени выключение',
    blocks: [{ kind: 'cancelShutdown', value: '' }],
  },
];
function checkVRM(bytes) {
  if (
    bytes.length < 20 ||
    bytes.length > 128 * 1024 * 1024 ||
    bytes.toString('ascii', 0, 4) !== 'glTF' ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length ||
    bytes.toString('ascii', 16, 20) !== 'JSON' ||
    bytes.readUInt32LE(12) > bytes.length - 20
  )
    throw Error('Повреждённый VRM');
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  if (!json.extensions?.VRM && !json.extensions?.VRMC_vrm) throw Error('Модель должна быть в формате VRM');
  if ([...(json.images || []), ...(json.buffers || [])].some((p) => p.uri && !p.uri.startsWith('data:')))
    throw Error('Выберите VRM со встроенными текстурами');
}
module.exports = {
  webURL,
  endpoint,
  normal,
  uid,
  Store,
  routine,
  runRoutine,
  templates,
  checkVRM,
  blockTypes,
  widgetNames,
  widgetLayout,
};
