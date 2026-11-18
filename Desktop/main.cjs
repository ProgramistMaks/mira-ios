const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  Notification,
  screen,
  globalShortcut,
  ipcMain,
  protocol,
  net,
  dialog,
  shell,
  safeStorage,
  clipboard,
  session,
} = require('electron');
const fs = require('node:fs'),
  fsp = fs.promises,
  path = require('node:path'),
  os = require('node:os'),
  { pathToFileURL } = require('node:url');
const { setTimeout: wait } = require('node:timers/promises');
const {
  Store,
  uid,
  normal,
  webURL,
  endpoint,
  routine,
  runRoutine,
  templates,
  checkVRM,
} = require('./core.cjs');
const { LocalModels } = require('./models.cjs'),
  network = require('./network.cjs'),
  speech = require('./speech.cjs'),
  { Telegram } = require('./telegram.cjs');
if (
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy
) {
  const exclusions = [process.env.NO_PROXY || process.env.no_proxy, 'localhost', '127.0.0.1', '[::1]']
    .filter(Boolean)
    .join(',');
  process.env.NO_PROXY = process.env.no_proxy = exclusions;
  require('node:http').setGlobalProxyFromEnv?.();
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mira',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);
const bundled = fs.existsSync(path.join(__dirname, 'renderer'));
const renderer = bundled
  ? path.join(__dirname, 'renderer')
  : path.join(__dirname, '..', 'Resources', 'Web');
const engines = process.env.MIRA_ENGINE_DIR || path.join(process.resourcesPath, 'engines');
if (process.platform === 'win32')
  process.env.PATH = path.join(engines, 'msvc') + path.delimiter + process.env.PATH;
const ui = path.join(__dirname, 'ui');
if (process.env.MIRA_TEST_PROFILE) app.setPath('userData', process.env.MIRA_TEST_PROFILE);
let main,
  overlay,
  tray,
  store,
  models,
  bot,
  job,
  voiceJob,
  timer,
  closing = false,
  overlayLock = false,
  cursorTimer,
  decoding;
const push = (data) => {
  for (const w of [main, overlay]) if (w && !w.isDestroyed()) w.webContents.send('update', data);
};
const changed = () => {
  store.save();
  push({ type: 'refresh' });
};
const errorText = (e) => e?.message || 'Не удалось выполнить действие';
const alert = (title, body) => {
  if (Notification.isSupported()) new Notification({ title, body: String(body).slice(0, 350) }).show();
  push({ type: 'notice', message: body });
};
function secret(k) {
  const v = store.data.secrets[k];
  return v ? safeStorage.decryptString(Buffer.from(v, 'base64')) : '';
}
function saveSecret(k, v) {
  if (!['ai', 'fish', 'search', 'telegram'].includes(k) && !/^mcp-[\w-]+$/.test(k))
    throw Error('Неизвестный ключ');
  if (v) {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text')
    )
      throw Error('Защищённое хранилище системы недоступно');
    store.data.secrets[k] = safeStorage.encryptString(String(v).trim()).toString('base64');
  } else delete store.data.secrets[k];
  store.save();
}
function show() {
  if (!main || main.isDestroyed()) return;
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
}
function globalKeys() {
  globalShortcut.unregisterAll();
  const used = new Set();
  const add = (key, fn) => {
    if (!key) return;
    if (used.has(key.toLowerCase()) || !globalShortcut.register(key, fn))
      throw Error('Сочетание занято или недоступно: ' + key);
    used.add(key.toLowerCase());
  };
  add(store.data.settings.hotkey, () => {
    show();
    push({ type: 'toggleVoice' });
  });
  for (const r of store.data.routines)
    add(r.hotkey, () => execute(r).catch((e) => alert('Мира', errorText(e))));
}
function updateKeys(fn) {
  const old = structuredClone({ settings: store.data.settings, routines: store.data.routines });
  fn();
  try {
    globalKeys();
  } catch (e) {
    Object.assign(store.data, old);
    try {
      globalKeys();
    } catch {}
    throw e;
  }
  changed();
}
async function localResource(req) {
  const u = new URL(req.url);
  if (u.hostname !== 'desk') return new Response(null, { status: 404 });
  const name = decodeURIComponent(u.pathname);
  let file;
  if (name === '/renderer/character.vrm') {
    const avatar = store.data.avatars.find((a) => a.id === store.data.settings.avatar);
    file = avatar?.path || path.join(renderer, 'character.vrm');
  } else if (name === '/music' && store.data.music) {
    file = store.data.music.path;
  } else if (
    /^\/renderer\/(index\.html|avatar\.js|choreography\.json|expression-catalog\.json|body-catalog\.json)$/.test(
      name,
    )
  )
    file = path.join(renderer, path.basename(name));
  else if (/^\/[a-zA-Z0-9_.-]+$/.test(name)) file = path.join(ui, name.slice(1));
  if (!file || !fs.existsSync(file)) return new Response(null, { status: 404 });
  const res = await net.fetch(pathToFileURL(file).href, { headers: req.headers });
  return res;
}
const prefs = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: path.join(__dirname, 'preload.cjs'),
};
function guard(w) {
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('mira://desk/')) e.preventDefault();
  });
  w.webContents.on('will-attach-webview', (e) => e.preventDefault());
}
let seated = false,
  stopTracking = null,
  freePosition = null;
function endSeat(restore = true) {
  stopTracking?.();
  stopTracking = null;
  seated = false;
  if (restore && overlay && !overlay.isDestroyed()) {
    if (freePosition) overlay.setPosition(...freePosition);
    overlay.showInactive();
  }
  freePosition = null;
  push({ type: 'seat', value: false });
  trayMenu();
}
function toggleSeat() {
  if (seated) {
    endSeat();
    return;
  }
  overlayState(true);
  freePosition = overlay.getPosition();
  seated = true;
  push({ type: 'seat', value: true });
  trayMenu();
  if (process.platform !== 'win32') return;
  if (main.isFocused()) main.minimize();
  alert('Вита на рабочем столе', 'Переключитесь на окно, на край которого сядет Вита.');
  stopTracking = require('./window-seat.cjs').followWindow(
    (rect) => {
      if (!overlay || !seated) return;
      if (!rect) {
        overlay.hide();
        return;
      }
      const left = screen.screenToDipPoint({ x: rect[0], y: rect[1] }),
        right = screen.screenToDipPoint({ x: rect[2], y: rect[1] });
      const area = screen.getDisplayNearestPoint(left).workArea,
        [w, h] = overlay.getSize();
      const x = Math.max(area.x, Math.min(area.x + area.width - w, right.x - w));
      const y = Math.max(area.y, Math.min(area.y + area.height - h, left.y - Math.round(h * 0.56)));
      overlay.setPosition(Math.round(x), Math.round(y));
      overlay.showInactive();
    },
    () => {
      endSeat();
      push({ type: 'refresh' });
    },
  );
}
function overlayState(open) {
  if (!open) {
    overlay?.close();
    return;
  }
  if (overlay) {
    overlay.show();
    return;
  }
  const a = screen.getDisplayMatching(main.getBounds()).workArea;
  overlay = new BrowserWindow({
    width: 265,
    height: 440,
    x: a.x + a.width - 285,
    y: a.y + a.height - 455,
    transparent: true,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: prefs,
  });
  guard(overlay);
  overlay.setAlwaysOnTop(true, 'floating');
  overlay.setIgnoreMouseEvents(overlayLock, { forward: true });
  overlay.on('closed', () => {
    overlay = null;
    endSeat(false);
    push({ type: 'refresh' });
    trayMenu();
  });
  overlay.loadURL('mira://desk/overlay.html');
  trayMenu();
  push({ type: 'refresh' });
}
function trayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Открыть Миру', click: show },
      { label: overlay ? 'Скрыть персонажа' : 'Персонаж поверх окон', click: () => overlayState(!overlay) },
      { label: seated ? 'Встать' : 'Сесть на край окна', enabled: !!overlay, click: toggleSeat },
      {
        label: 'Пропускать нажатия сквозь персонажа',
        type: 'checkbox',
        checked: overlayLock,
        click: () => {
          overlayLock = !overlayLock;
          overlay?.setIgnoreMouseEvents(overlayLock, { forward: true });
        },
      },
      { type: 'separator' },
      { label: 'Выйти', click: () => app.quit() },
    ]),
  );
}
function cpuSnapshot() {
  return os
    .cpus()
    .reduce(
      (s, c) => ({
        idle: s.idle + c.times.idle,
        total: s.total + Object.values(c.times).reduce((x, y) => x + y, 0),
      }),
      { idle: 0, total: 0 },
    );
}
let prevCpu = cpuSnapshot(),
  gpu = null,
  gpuSample = 0,
  gpuPending = false;
function sampleGPU() {
  if (process.platform !== 'win32' || gpuPending || Date.now() - gpuSample < 10000) return;
  gpuSample = Date.now();
  gpuPending = true;
  speech
    .ps(
      "$g=Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Where-Object Name -like '*engtype_3D' | Measure-Object UtilizationPercentage -Sum; if ($g.Count) { [Console]::WriteLine([Math]::Min(100,$g.Sum)) }",
    )
    .then((v) => {
      const n = Number(v.trim());
      gpu = v.trim() && Number.isFinite(n) ? n : null;
    })
    .catch(() => {})
    .finally(() => {
      gpuPending = false;
    });
}
function system() {
  sampleGPU();
  const cur = cpuSnapshot(),
    total = cur.total - prevCpu.total,
    cpu = total ? Math.round(100 * (1 - (cur.idle - prevCpu.idle) / total)) : 0;
  prevCpu = cur;
  return {
    cpu,
    gpu,
    ram: Math.round(100 * (1 - os.freemem() / os.totalmem())),
    memory: Math.round(os.totalmem() / 2 ** 30),
    platform: process.platform,
  };
}
function cancel() {
  job?.abort();
  job = null;
  voiceJob?.abort();
  voiceJob = null;
  decoding?.reject(Error('Отменено'));
  decoding = null;
  push({ type: 'stopAudio' });
}
function activeFocus(mins) {
  store.data.focus = { ends: Date.now() + mins * 60000, remaining: mins * 60000 };
  changed();
}
function tick() {
  const d = store.data,
    now = Date.now();
  let dirty = false;
  if (d.focus.ends && d.focus.ends <= now) {
    d.focus = { ends: 0, remaining: 0 };
    alert('Время отдохнуть', 'Сессия фокуса завершена');
    dirty = true;
  }
  for (const ev of d.events)
    if (!ev.fired && ev.time <= now) {
      ev.fired = true;
      alert('Напоминание', ev.text);
      dirty = true;
    }
  if (dirty) changed();
}
function addItem(kind, text, time) {
  text = String(text || '')
    .trim()
    .slice(0, 10000);
  if (!text) throw Error('Введите текст');
  if (kind === 'events' && (!Number.isFinite(time) || time <= Date.now()))
    throw Error('Выберите дату в будущем');
  const item = {
    id: uid(),
    text,
    created: Date.now(),
    ...(kind === 'tasks' ? { done: false } : {}),
    ...(kind === 'events' ? { time, fired: false } : {}),
  };
  store.data[kind].unshift(item);
  changed();
  return item;
}
async function pick(options) {
  const a = await dialog.showOpenDialog(main, { properties: ['openFile'], ...options });
  return a.canceled ? null : a.filePaths[0];
}
async function importFile(kind) {
  const filters = {
    avatar: [{ name: 'Персонаж VRM', extensions: ['vrm'] }],
    voice: [{ name: 'Голос Piper', extensions: ['onnx'] }],
    music: [{ name: 'Музыка', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] }],
    attachment: [{ name: 'Текст', extensions: ['txt', 'md', 'csv', 'json', 'log'] }],
  };
  const file = await pick({
    filters: filters[kind] || [],
    ...(kind === 'folder' ? { properties: ['openDirectory'] } : {}),
  });
  if (!file) return null;
  const name = path.basename(file),
    id = uid(),
    stat = await fsp.stat(file);
  if (kind === 'attachment') {
    if (stat.size > 150000) throw Error('Выберите текстовый файл меньше 150 КБ');
    return { name, text: (await fsp.readFile(file, 'utf8')).slice(0, 35000) };
  }
  if (kind === 'music') {
    store.data.music = { path: file, name };
  } else if (kind === 'avatar' || kind === 'voice') {
    if (stat.size > (kind === 'avatar' ? 128 : 250) * 1024 ** 2) throw Error('Файл слишком большой');
    const dir = path.join(store.dir, 'library', id);
    await fsp.mkdir(dir, { recursive: true });
    try {
      if (kind === 'avatar') {
        const b = await fsp.readFile(file);
        checkVRM(b);
        const dest = path.join(dir, 'character.vrm');
        await fsp.writeFile(dest, b);
        store.data.avatars.push({ id, name, path: dest });
        store.data.settings.avatar = id;
      } else {
        const cfg = await fsp.readFile(file + '.json', 'utf8').catch(() => {
          throw Error('Рядом с голосом нужен файл .onnx.json');
        });
        const meta = JSON.parse(cfg);
        if (!meta.audio?.sample_rate || !meta.phoneme_id_map)
          throw Error('Файл не является конфигурацией Piper');
        const dest = path.join(dir, 'voice.onnx');
        await fsp.copyFile(file, dest);
        await fsp.writeFile(dest + '.json', cfg);
        store.data.voices.push({ id, name, path: dest });
        store.data.settings.voice = id;
      }
    } catch (e) {
      await fsp.rm(dir, { recursive: true, force: true });
      throw e;
    }
  } else {
    store.data.files.push({ id, name, path: file, kind: stat.isDirectory() ? 'folder' : 'file' });
  }
  changed();
  return { id, name };
}
async function findFiles(query) {
  const roots = store.data.files.filter((f) => f.kind === 'folder');
  if (!roots.length) throw Error('Добавьте папку для поиска в настройках');
  const q = normal(query);
  if (q.length < 2) throw Error('Введите хотя бы два символа');
  const items = [];
  let seen = 0;
  for (const root of roots) {
    const queue = [root.path];
    for (let i = 0; i < queue.length && seen < 18000 && items.length < 30; i++) {
      const dir = queue[i],
        children = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const f of children) {
        if (++seen > 18000 || items.length >= 30) break;
        if (f.isSymbolicLink() || f.name.startsWith('.')) continue;
        if (f.isDirectory()) {
          if (!['node_modules', '$RECYCLE.BIN'].includes(f.name)) queue.push(path.join(dir, f.name));
          continue;
        }
        if (f.isFile() && normal(f.name).includes(q)) {
          const id = uid(),
            p = path.join(dir, f.name);
          foundFiles.set(id, p);
          items.push({ id, name: f.name, folder: path.relative(root.path, dir) || root.name });
        }
      }
    }
  }
  return items;
}
const foundFiles = new Map();
async function openFile(id) {
  const file = store.data.files.find((f) => f.id === id)?.path || foundFiles.get(id);
  if (!file) throw Error('Файл не найден');
  const err = await shell.openPath(file);
  if (err) throw Error(err);
}
const spoken = new Map();
function speakLine(text, signal) {
  const id = uid();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timeout);
      spoken.delete(id);
      signal.removeEventListener('abort', abort);
      error ? reject(Error(error)) : resolve();
    };
    const abort = () => {
      push({ type: 'stopAudio' });
      finish('Команда остановлена');
    };
    const timeout = setTimeout(() => finish('Голос не ответил'), 180000);
    if (signal.aborted) {
      abort();
      return;
    }
    spoken.set(id, finish);
    signal.addEventListener('abort', abort, { once: true });
    main.webContents.send('update', { type: 'say', id, text });
  });
}
let executing = null;
async function execute(spec, remote = false) {
  if (executing) throw Error('Уже выполняется команда');
  const controller = new AbortController();
  executing = controller;
  try {
    await runRoutine(
      spec,
      async (b) => {
        if (remote && ['paste', 'keys', 'file'].includes(b.kind))
          throw Error('Эта команда доступна только непосредственно на ПК');
        switch (b.kind) {
          case 'wait':
            return wait(+b.value * 1000, undefined, { signal: controller.signal });
          case 'say':
            return speakLine(b.value, controller.signal);
          case 'notify':
            alert(store.data.settings.name, b.value);
            return;
          case 'note':
            addItem('notes', b.value);
            return;
          case 'task':
            addItem('tasks', b.value);
            return;
          case 'focus':
            activeFocus(+b.value);
            return;
          case 'theme':
            if (!['cream', 'night', 'sage', 'rose', 'graphite', 'coal', 'mist', 'system'].includes(b.value))
              throw Error('Неизвестная тема');
            store.data.settings.theme = b.value;
            changed();
            return;
          case 'switchTheme':
            return store.data.settings.theme === b.value;
          case 'dance':
            push({ type: 'dance' });
            return;
          case 'url':
            return shell.openExternal(webURL(b.value));
          case 'file':
            return openFile(b.value);
          case 'music':
            if (!store.data.music) throw Error('Выберите дорожку в плеере');
            push({ type: 'playMusic' });
            return;
          case 'search': {
            const results = await network.search(b.value, secret('search'), controller.signal);
            push({ type: 'results', results, query: b.value });
            return;
          }
          case 'keys':
          case 'paste': {
            if (process.platform !== 'win32') throw Error('Системный ввод доступен в Windows');
            if (b.kind === 'paste') clipboard.writeText(b.value);
            const key =
              b.kind === 'paste'
                ? '^v'
                : {
                    copy: '^c',
                    paste: '^v',
                    undo: '^z',
                    save: '^s',
                    find: '^f',
                    selectAll: '^a',
                    playPause: '{MEDIA_PLAY_PAUSE}',
                    nextTrack: '{MEDIA_NEXT_TRACK}',
                  }[b.value];
            if (['playPause', 'nextTrack'].includes(b.value))
              throw Error('Для плеера выберите действие «Включить музыку»');
            main.minimize();
            await wait(350, undefined, { signal: controller.signal });
            await speech.ps(
              '(New-Object -ComObject WScript.Shell).SendKeys($env:MIRA_KEYS)',
              { MIRA_KEYS: key },
              controller.signal,
            );
            return;
          }
        }
      },
      controller.signal,
    );
    return 'Выполнена команда «' + spec.name + '».';
  } finally {
    if (executing === controller) executing = null;
  }
}
function getChat(id) {
  let c = store.data.chats.find((c) => c.id === id);
  if (!c) {
    c = { id: uid(), title: 'Новый чат', messages: [], created: Date.now() };
    store.data.chats.unshift(c);
  }
  return c;
}
async function answer(text, chat, signal, remote = false) {
  const d = store.data,
    s = d.settings;
  let m;
  const spec = d.routines.find((r) => normal(r.phrase) && normal(r.phrase) === normal(text));
  if (spec) return { text: await execute(spec, remote) };
  if (/^(потанцуй|танцуй|станцуй)[.!]?$/iu.test(text)) {
    push({ type: 'dance' });
    return { text: 'Давай потанцуем!' };
  }
  if (
    /^(?:(?:покажи|прочитай|перечисли) (?:мои )?)?(?:заметки|задачи|планы на сегодня|напоминания)[?.!]*$/iu.test(
      text,
    )
  ) {
    const events = d.events
      .filter(
        (e) =>
          !e.fired &&
          (!text.includes('сегодня') || new Date(e.time).toDateString() === new Date().toDateString()),
      )
      .sort((a, b) => a.time - b.time);
    const list = /заметки/iu.test(text)
      ? d.notes.map((n) => n.text)
      : /задачи/iu.test(text)
        ? d.tasks.filter((t) => !t.done).map((t) => t.text)
        : events.map((e) => new Date(e.time).toLocaleString('ru-RU') + ' — ' + e.text);
    return { text: list.slice(0, 12).join('\n') || 'Список пока пуст.' };
  }
  if ((m = text.match(/^(?:запиши(?:\s+заметку)?|заметка|запомни)[\s:!,.-]+(.+)/isu))) {
    addItem('notes', m[1]);
    return { text: 'Записала в заметки.' };
  }
  if ((m = text.match(/^(?:новая задача|добавь задачу|задача)\s*[: ]\s*(.+)/isu))) {
    addItem('tasks', m[1]);
    return { text: 'Добавила задачу.' };
  }
  if ((m = text.match(/^напомни через (\d{1,4}) (мин\S*|час\S*)\s+(.+)/iu))) {
    const delta = +m[1] * (m[2].startsWith('час') ? 3600000 : 60000);
    addItem('events', m[3], Date.now() + delta);
    return { text: 'Напоминание сохранено.' };
  }
  if ((m = text.match(/^напомни (сегодня|завтра|послезавтра) в (\d{1,2})(?:[:.]([0-5]\d))?[ ,]+(.+)/iu))) {
    const date = new Date();
    if (+m[2] > 23) throw Error('Укажите время от 0 до 23 часов');
    date.setDate(date.getDate() + ['сегодня', 'завтра', 'послезавтра'].indexOf(m[1].toLowerCase()));
    date.setHours(+m[2], +(m[3] || 0), 0, 0);
    addItem('events', m[4], date.getTime());
    return { text: 'Напомню ' + date.toLocaleString('ru-RU') + '.' };
  }
  if ((m = text.match(/^(?:фокус|режим уч[её]бы)(?: на)?(?:\s+(\d+))?/iu))) {
    const mins = Math.max(1, Math.min(240, Number(m[1]) || 25));
    activeFocus(mins);
    return { text: 'Включила фокус на ' + mins + ' мин.' };
  }
  if ((m = text.match(/^(?:найди файл|поищи файл)\s+(.+)/iu))) {
    const items = await findFiles(m[1]);
    return {
      text: items.length
        ? 'Нашла на компьютере: ' + items.map((x) => x.name).join(', ')
        : 'В выбранных папках совпадений нет.',
      files: remote ? [] : items,
    };
  }
  if (
    (m = text.match(/^(?:найди(?: в интернете| в сети)?|поищи|поиск(?: в интернете)?)\s*[: ]\s*(.+)/isu))
  ) {
    const results = await network.search(m[1], secret('search'), signal);
    return { text: results[0]?.text?.slice(0, 900) || 'Вот что удалось найти.', sources: results };
  }
  if (/погод[ауые]/iu.test(text) && text.length < 100) {
    const loc = text.match(/\sв\s+(.+?)[?!.,]*$/iu)?.[1] || s.city;
    const w = await network.weather(loc);
    return {
      text:
        w.city +
        ' — сейчас ' +
        Math.round(w.temp) +
        ' °C. Максимум сегодня ' +
        Math.round(w.days[0]) +
        ' °C.',
    };
  }
  if (/курсы? валют|курс доллара/iu.test(text)) {
    const r = await network.rates();
    return {
      text: 'По курсу ЦБ доллар стоит ' + r.USD.toFixed(2) + ' ₽, евро — ' + r.EUR.toFixed(2) + ' ₽.',
    };
  }
  if ((m = text.match(/^открой\s+(.+)/iu))) {
    const f = d.files.find((f) => normal(f.name) === normal(m[1]));
    if (f && !remote) {
      await openFile(f.id);
      return { text: 'Открыла ' + f.name + '.' };
    }
    const link =
      {
        youtube: 'https://www.youtube.com',
        ютуб: 'https://www.youtube.com',
        гугл: 'https://www.google.com',
      }[normal(m[1])] || (/^https?:\/\//i.test(m[1]) ? webURL(m[1]) : '');
    if (link && !remote) {
      await shell.openExternal(link);
      return { text: 'Открыла сайт в браузере.' };
    }
  }
  let base = s.base,
    key = secret('ai'),
    model = s.cloudModel;
  if (s.provider === 'local') {
    const link = await models.connection(s.model);
    base = link.base;
    key = link.key;
    model = link.id;
  }
  const recent = chat.messages
    .filter((x) => !x.error)
    .slice(-16)
    .map(({ role, text: t }) => ({ role, content: t }));
  const messages = [{ role: 'system', content: 'Тебя зовут ' + s.name + '. ' + s.role }, ...recent];
  const connector =
    !remote && d.tools.find((t) => normal(text).startsWith('через ' + normal(t.name) + ' '));
  if (connector) {
    const config = { ...connector, token: secret('mcp-' + connector.id) };
    const listed = await network.mcp(config, 'tools/list', {}, signal);
    const call = await network.selectTool(base, key, model, messages, listed.tools || [], signal);
    if (call.text) return { text: call.text };
    const choice = await dialog.showMessageBox(main, {
      type: 'question',
      message: connector.name + ' · ' + call.name,
      detail: JSON.stringify(call.args, null, 2).slice(0, 2000),
      buttons: ['Выполнить', 'Отмена'],
      defaultId: 0,
      cancelId: 1,
    });
    signal.throwIfAborted();
    if (choice.response !== 0) return { text: 'Вызов отменён.' };
    const outcome = await network.mcp(
      config,
      'tools/call',
      { name: call.name, arguments: call.args },
      signal,
    );
    const result =
      (outcome.content || []).map((c) => c.text || c.type).join('\n') ||
      JSON.stringify(outcome.structuredContent || {});
    if (outcome.isError) throw Error(result.slice(0, 700));
    return {
      text: await network.ai(
        base,
        key,
        model,
        [
          ...messages,
          {
            role: 'user',
            content: 'Данные инструмента ' + call.name + ' для моего запроса:\n' + result.slice(0, 18000),
          },
        ],
        signal,
      ),
    };
  }
  return { text: await network.ai(base, key, model, messages, signal) };
}
async function chatSend(data, signal, remote = false) {
  const text = String(data.text || '')
    .trim()
    .slice(0, 45000);
  if (!text) throw Error('Введите сообщение');
  const chat = getChat(data.id);
  if (chat.messages.length === 0) chat.title = text.slice(0, 48);
  chat.messages.push({ role: 'user', text, time: Date.now() });
  changed();
  try {
    const a = await answer(text, chat, signal, remote);
    signal.throwIfAborted();
    chat.messages.push({ role: 'assistant', ...a, time: Date.now() });
    changed();
    return { id: chat.id, ...a };
  } catch (e) {
    if (!signal.aborted) {
      chat.messages.push({ role: 'assistant', text: errorText(e), error: true, time: Date.now() });
      changed();
    }
    throw e;
  }
}
let communityPacks = [];
const extensionPresets = [
  {
    id: 'focus-kit',
    name: 'Учёба и отдых',
    detail: 'Два голосовых сценария для короткой учебной сессии.',
    routines: [templates[0], templates[1]],
  },
  {
    id: 'evening-kit',
    name: 'Вечерний стол',
    detail: 'Тёмная тема и музыка по фразе.',
    routines: [templates[2], templates[3]],
  },
];
function installPack(pack) {
  if (!pack || !Array.isArray(pack.routines) || !pack.routines.length || pack.routines.length > 30)
    throw Error('Нужен набор из 1–30 команд');
  const name = String(pack.name || 'Мой набор').slice(0, 100),
    id = String(pack.id || uid()).slice(0, 90);
  if (store.data.extensions.some((p) => p.id === id)) throw Error('Набор уже установлен');
  const list = pack.routines.map((r) => ({ ...routine(r), id: uid(), hotkey: '' }));
  const triggers = new Set(store.data.routines.map((r) => normal(r.phrase)).filter(Boolean));
  for (const r of list)
    if (r.phrase) {
      if (triggers.has(normal(r.phrase))) throw Error('Фраза уже занята: ' + r.phrase);
      triggers.add(normal(r.phrase));
    }
  store.data.routines.push(...list);
  store.data.extensions.push({ id, name, routines: list.map((x) => x.id) });
  changed();
  return name;
}
async function saveJson(name, obj) {
  const p = await dialog.showSaveDialog(main, {
    defaultPath: name + '.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!p.canceled) await fsp.writeFile(p.filePath, JSON.stringify(obj, null, 2));
  return !p.canceled;
}
async function readPack() {
  const p = await pick({ filters: [{ name: 'Набор Миры', extensions: ['json'] }] });
  if (!p) return null;
  if ((await fsp.stat(p)).size > 512000) throw Error('Файл слишком большой');
  return JSON.parse(await fsp.readFile(p, 'utf8'));
}
const actions = {
  state: () => ({
    ...store.public(),
    models: models.list(),
    templates,
    extensionPresets: extensionPresets.map(({ id, name, detail }) => ({ id, name, detail })),
    overlay: !!overlay,
    seated,
    version: app.getVersion(),
  }),
  async removeModel({ id }) {
    const model = models.list().find((m) => m.id === id);
    if (!model) return false;
    const result = await dialog.showMessageBox(main, {
      type: 'question',
      message: 'Удалить с компьютера ' + model.name + ' ' + model.quant + '?',
      buttons: ['Оставить', 'Удалить'],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response !== 1) return false;
    await models.remove(id);
    changed();
    return true;
  },
  system,
  models: () => models.list(),
  download: ({ id }) => models.startDownload(id),
  pauseDownload: () => models.cancel(),
  settings: (input) => {
    const s = { ...store.data.settings };
    for (const k of ['name', 'user', 'role', 'cloudModel', 'fishVoice', 'systemVoice', 'city', 'hotkey'])
      if (k in input)
        s[k] = String(input[k])
          .trim()
          .slice(0, k === 'role' ? 2500 : 160);
    for (const [k, items] of Object.entries({
      theme: ['cream', 'night', 'sage', 'rose', 'graphite', 'coal', 'mist', 'system'],
      provider: ['local', 'endpoint'],
      fps: [30, 60, 120, 240],
      avatar: ['vita', ...store.data.avatars.map((x) => x.id)],
      voice: ['builtin', 'system', 'fish', ...store.data.voices.map((x) => x.id)],
      model: models.list().map((x) => x.id),
    })) {
      if (k in input) {
        if (!items.includes(input[k])) throw Error('Недопустимое значение');
        s[k] = input[k];
      }
    }
    if ('accent' in input) {
      if (input.accent && !/^#[\da-f]{6}$/i.test(input.accent)) throw Error('Выберите цвет');
      s.accent = input.accent;
    }
    if ('glow' in input) s.glow = Math.max(0, Math.min(100, Number(input.glow) || 0));
    if ('base' in input) s.base = endpoint(input.base);
    for (const k of ['reduced', 'showAvatar', 'glass']) if (k in input) s[k] = !!input[k];
    if (!s.name || !s.city) throw Error('Укажите имя и город');
    if (new URL(s.base).origin !== new URL(store.data.settings.base).origin) delete store.data.secrets.ai;
    if (s.provider !== store.data.settings.provider || s.model !== store.data.settings.model) models.stop();
    if ('hotkey' in input)
      updateKeys(() => {
        store.data.settings = s;
      });
    else {
      store.data.settings = s;
      changed();
    }
    return s;
  },
  key: ({ name, value }) => {
    if (name === 'telegram') {
      bot.stop();
      store.data.pairedChat = '';
      store.data.telegramOffset = 0;
    }
    saveSecret(name, value);
    changed();
  },
  send: async (data) => {
    if (job) throw Error('Предыдущий ответ ещё готовится');
    const own = new AbortController();
    job = own;
    try {
      return await chatSend(data, own.signal);
    } finally {
      if (job === own) job = null;
    }
  },
  spoken: ({ id, error }) => spoken.get(id)?.(error),
  stop: () => {
    executing?.abort();
    cancel();
  },
  newChat: () => {
    const c = getChat();
    changed();
    return c.id;
  },
  deleteChat: ({ id }) => {
    store.data.chats = store.data.chats.filter((c) => c.id !== id);
    changed();
  },
  speech: async ({ text }) => {
    voiceJob?.abort();
    const own = new AbortController();
    voiceJob = own;
    try {
      return await speech.speak(engines, store.data, text, secret('fish'), own.signal);
    } finally {
      if (voiceJob === own) voiceJob = null;
    }
  },
  transcribe: async ({ bytes }) => {
    voiceJob?.abort();
    const own = new AbortController();
    voiceJob = own;
    try {
      return await speech.transcribe(engines, bytes, own.signal);
    } finally {
      if (voiceJob === own) voiceJob = null;
    }
  },
  fish: ({ query, page }) => network.fishVoices(secret('fish'), query, page),
  systemVoices: async () =>
    process.platform !== 'win32'
      ? []
      : JSON.parse(
          (
            await speech.ps(
              '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ConvertTo-Json -InputObject @($s.GetInstalledVoices() | ForEach-Object {$_.VoiceInfo.Name}); $s.Dispose()',
            )
          ).trim() || '[]',
        ),
  import: ({ kind }) => {
    if (!['avatar', 'voice', 'music', 'attachment', 'file', 'folder'].includes(kind))
      throw Error('Неизвестный тип файла');
    return importFile(kind);
  },
  openFile: ({ id }) => openFile(id),
  find: ({ query }) => {
    foundFiles.clear();
    return findFiles(query);
  },
  url: ({ url }) => shell.openExternal(webURL(url)),
  weather: () => network.weather(store.data.settings.city),
  rates: network.rates,
  add: ({ kind, text, time }) => {
    if (!['tasks', 'notes', 'events'].includes(kind)) throw Error('Неизвестный список');
    return addItem(kind, text, time);
  },
  toggleTask: ({ id }) => {
    const t = store.data.tasks.find((x) => x.id === id);
    if (t) {
      t.done = !t.done;
      changed();
    }
  },
  remove: ({ kind, id }) => {
    if (!['tasks', 'notes', 'events', 'files', 'tools'].includes(kind)) throw Error('Неизвестный список');
    store.data[kind] = store.data[kind].filter((x) => x.id !== id);
    if (kind === 'tools') delete store.data.secrets['mcp-' + id];
    changed();
  },
  focus: ({ action, minutes }) => {
    const f = store.data.focus;
    if (action === 'start') activeFocus(Math.max(1, Math.min(240, Number(minutes) || 25)));
    else if (action === 'pause' && f.ends) {
      f.remaining = Math.max(0, f.ends - Date.now());
      f.ends = 0;
      changed();
    } else if (action === 'resume' && f.remaining > 0 && !f.ends) {
      f.ends = Date.now() + f.remaining;
      changed();
    } else if (action === 'reset') {
      store.data.focus = { ends: 0, remaining: 25 * 60000 };
      changed();
    }
  },
  saveRoutine: (input) => {
    const r = routine(input);
    if (store.data.routines.some((x) => x.id !== r.id && r.phrase && normal(x.phrase) === normal(r.phrase)))
      throw Error('Такая фраза уже занята');
    updateKeys(() => {
      store.data.routines = [...store.data.routines.filter((x) => x.id !== r.id), r];
    });
    return r.id;
  },
  removeRoutine: ({ id }) =>
    updateKeys(() => {
      store.data.routines = store.data.routines.filter((x) => x.id !== id);
    }),
  run: ({ id }) => {
    const r = store.data.routines.find((x) => x.id === id);
    if (!r) throw Error('Команда не найдена');
    return execute(r);
  },
  cancelRun: () => executing?.abort(),
  exportRoutine: ({ id }) => {
    const r = store.data.routines.find((x) => x.id === id);
    if (!r) throw Error('Команда не найдена');
    return saveJson(r.name, { name: r.name, routines: [r] });
  },
  community: async ({ url }) => {
    const source = endpoint(url),
      packs = await network.community(source);
    communityPacks = packs.map((p, i) => ({
      ...p,
      id:
        'catalog-' +
        require('node:crypto')
          .createHash('sha256')
          .update(source + '#' + (p.id || p.name))
          .digest('hex')
          .slice(0, 22),
    }));
    store.data.catalogURL = source;
    changed();
    return communityPacks.map((p) => ({
      id: p.id,
      name: p.name,
      detail: String(p.detail || '').slice(0, 280),
      count: p.routines.length,
    }));
  },
  communityInstall: ({ id }) => installPack(communityPacks.find((p) => p.id === id)),
  pack: ({ id }) => installPack(extensionPresets.find((p) => p.id === id)),
  importPack: async () => {
    const p = await readPack();
    return p ? installPack(p) : null;
  },
  removePack: ({ id }) => {
    const p = store.data.extensions.find((x) => x.id === id);
    if (!p) return;
    updateKeys(() => {
      store.data.routines = store.data.routines.filter((r) => !p.routines.includes(r.id));
    });
    store.data.extensions = store.data.extensions.filter((x) => x.id !== id);
    changed();
  },
  addMCP: ({ name, url, token }) => {
    const t = { id: uid(), name: String(name || 'MCP').slice(0, 100), url: endpoint(url) };
    if (token) saveSecret('mcp-' + t.id, token);
    store.data.tools.push(t);
    changed();
    return t.id;
  },
  mcp: ({ id, tool, args }) => {
    const t = store.data.tools.find((x) => x.id === id);
    if (!t) throw Error('Сервер не найден');
    return network.mcp(
      { ...t, token: secret('mcp-' + id) },
      tool ? 'tools/call' : 'tools/list',
      tool ? { name: String(tool), arguments: args || {} } : {},
    );
  },
  pair: () => bot.pair(),
  unpair: () => {
    bot.stop();
    store.data.pairedChat = '';
    changed();
  },
  decoded: ({ id, bytes }) => {
    if (decoding?.id === id) {
      const x = decoding;
      decoding = null;
      x.resolve(bytes);
    }
  },
  seat: () => toggleSeat(),
  overlay: ({ open }) => overlayState(!!open),
  show,
  overlayMenu: () => tray?.popUpContextMenu(),
  window: ({ action }) => {
    if (action === 'min') main.minimize();
    if (action === 'max') {
      if (main.isMaximized()) main.unmaximize();
      else main.maximize();
    }
    if (action === 'close') main.close();
  },
  motion: ({ id }) => push({ type: 'motion', id }),
  phase: ({ value }) => overlay?.webContents.send('update', { type: 'phase', value }),
  level: ({ value }) =>
    overlay?.webContents.send('update', {
      type: 'level',
      value: Math.max(0, Math.min(1, Number(value) || 0)),
    }),
};
function init() {
  store = new Store(app.getPath('userData'));
  models = new LocalModels(
    path.join(store.dir, 'models'),
    path.join(engines, 'llama', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'),
    push,
  );
  bot = new Telegram(
    store,
    () => secret('telegram'),
    async (kind, data, signal) => {
      if (kind === 'voice') {
        if (decoding) throw Error('Обрабатывается голосовое сообщение');
        const id = uid();
        let timeout;
        const wav = await new Promise((resolve, reject) => {
          timeout = setTimeout(() => {
            decoding = null;
            reject(Error('Не удалось декодировать голосовое сообщение'));
          }, 20000);
          decoding = { id, resolve, reject };
          push({ type: 'decode', id, bytes: data });
        }).finally(() => clearTimeout(timeout));
        return speech.transcribe(engines, wav, signal);
      }
      const c = store.data.chats.find((x) => x.telegram) || getChat();
      c.telegram = true;
      const r = await chatSend({ text: data, id: c.id }, signal, true);
      return r.text;
    },
    push,
  );
  protocol.handle('mira', localResource);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) =>
    cb(
      wc === main?.webContents &&
        permission === 'media' &&
        details.requestingUrl?.startsWith('mira://desk/') &&
        !details.mediaTypes?.includes('video'),
    ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (wc, p, origin) =>
      wc === main?.webContents &&
      p === 'media' &&
      (origin === 'mira://desk' || origin.startsWith('mira://desk/')),
  );
  main = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 580,
    frame: false,
    backgroundColor: '#f5efe2',
    title: 'Мира',
    icon: path.join(ui, 'icon.png'),
    webPreferences: prefs,
  });
  guard(main);
  main.loadURL('mira://desk/index.html');
  main.on('close', (e) => {
    if (!closing) {
      e.preventDefault();
      main.hide();
    }
  });
  tray = new Tray(nativeImage.createFromPath(path.join(ui, 'icon.png')).resize({ width: 24, height: 24 }));
  tray.setToolTip('Мира');
  tray.on('click', show);
  trayMenu();
  try {
    globalKeys();
  } catch (e) {
    setTimeout(() => push({ type: 'notice', message: errorText(e) }), 1800);
  }
  timer = setInterval(tick, 1200);
  tick();
  cursorTimer = setInterval(() => {
    if (!overlay || overlay.isDestroyed()) return;
    const c = screen.getCursorScreenPoint(),
      b = overlay.getBounds();
    overlay.webContents.send('update', {
      type: 'look',
      x: Math.max(-1, Math.min(1, (c.x - b.x - b.width / 2) / 360)),
      y: Math.max(-1, Math.min(1, (c.y - b.y - b.height * 0.28) / 350)),
    });
  }, 110);
  if (store.data.pairedChat && store.data.secrets.telegram) bot.listen();
}
ipcMain.handle('desk', async (e, name, data = {}) => {
  if (
    !e.senderFrame ||
    e.senderFrame !== e.sender.mainFrame ||
    !e.senderFrame.url.startsWith('mira://desk/')
  )
    throw Error('Недоступно');
  if (
    !Object.hasOwn(actions, name) ||
    (e.sender !== main?.webContents &&
      !(e.sender === overlay?.webContents && ['state', 'show', 'overlayMenu', 'overlay'].includes(name)))
  )
    throw Error('Недоступно');
  return actions[name](data || {});
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', show);
  app.whenReady().then(init);
}
app.on('before-quit', () => {
  closing = true;
  stopTracking?.();
  cancel();
  executing?.abort();
  bot?.stop();
  models?.cancel();
  models?.stop();
  clearInterval(timer);
  clearInterval(cursorTimer);
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => app.quit());
