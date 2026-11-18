import {
  $,
  esc,
  ico,
  call,
  icons,
  btn,
  field,
  toast,
  timeLabel,
  timerTime,
  avatar,
  phase,
} from './shared.js';
import * as pages from './pages.js';
import { Voice } from './audio.js';
let state,
  page = 'home',
  current = '',
  sending = false,
  attachment,
  refreshId = 0,
  liveStatus = '',
  drag = -1,
  externalResults = [],
  lastAvatar = '',
  busyDownload = false;
const cache = { gesture: 'auto', emotion: '', draft: null, progress: null },
  music = new Audio();
music.controls = true;
music.preload = 'metadata';
const voice = new Voice(
  (text) => send(text, true),
  (msg, p) => {
    liveStatus = msg;
    $('#voiceStatus').textContent = msg;
    $('#voiceBar').hidden = !msg;
    $('#voiceStart').innerHTML =
      ico('audio-lines') + (voice.enabled ? 'Завершить разговор' : 'Разговор голосом');
    phase(p, state?.settings.reduced || false);
  },
  (e) => toast(e.message),
);
const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const tabs = $('#tabs');
tabs.innerHTML = Object.entries(pages.tabIcons)
  .map(([id, icon]) => '<button data-go="' + id + '">' + ico(icon) + pages.names[id] + '</button>')
  .join('');
icons();
const avatarFrame = $('#avatar');
let avatarReadyTimer;
function setupAvatar() {
  clearTimeout(avatarReadyTimer);
  const a = avatar();
  if (!a?.ready) {
    avatarReadyTimer = setTimeout(setupAvatar, 160);
    return;
  }
  a.configureChoreography(cache.gesture);
  a.configurePerformance({ emotion: cache.emotion || 'auto', variant: -1 });
  a.setFrameRate(state.settings.fps);
  a.setState(voice.enabled ? 'listening' : 'idle', state.settings.reduced);
  a.setMotionOutput(!!state.motionPort);
  a.setActive((page === 'home' && state.settings.showAvatar) || page === 'model');
}
avatarFrame.addEventListener('load', () => {
  if (state) setupAvatar();
});
function renderFrame() {
  const visible = page === 'model' || (page === 'home' && state.settings.showAvatar);
  $('#scene').hidden = !visible;
  const a = avatar();
  if (lastAvatar !== state.settings.avatar) {
    if (lastAvatar)
      avatarFrame.src = '/renderer/index.html?character=' + encodeURIComponent(state.settings.avatar);
    lastAvatar = state.settings.avatar;
  }
  a?.setMotionOutput(!!state.motionPort);
  a?.setActive(visible);
  a?.setFrameRate(state.settings.fps);
  $('#nameplate span').textContent =
    state.avatars.find((v) => v.id === state.settings.avatar)?.name || 'Вита';
}
function nav(next) {
  if (!pages.names[next]) return;
  pages.captureDraft(cache.draft);
  page = next;
  if (page === 'commands' && !cache.draft && state.routines.length)
    cache.draft = structuredClone(state.routines[0]);
  $('#drawer').hidden = true;
  render();
  if (page === 'desk') refreshSystem();
  if (page === 'voice' && !cache.sysVoices)
    call('systemVoices')
      .then((v) => {
        cache.sysVoices = v;
        if (page === 'voice') renderPage();
      })
      .catch(() => {});
}
function renderPage() {
  if (page === 'home') return;
  const previous = $('#content').scrollTop;
  $('#content').classList.toggle('expandedGraph', page === 'commands' && !!cache.expanded);
  $('#content').innerHTML = pages[page](state, cache);
  if (page === 'desk' && state.music) {
    setMusic();
    $('#musicSlot').append(music);
  }
  $('#content').scrollTop = previous;
}
function setMusic() {
  if (state.music && music.dataset.name !== state.music.name) {
    music.src = 'mira://desk/music?track=' + encodeURIComponent(state.music.name);
    music.dataset.name = state.music.name;
  }
}
music.addEventListener('play', () => {
  avatar()?.dance();
  call('motion', { id: 'dance' });
});
function cards() {
  const s = state;
  const rows = [
    ['list-checks', 'green', 'Задачи', s.tasks.filter((x) => !x.done).length + ' в списке', 'tasks'],
    ['timer', 'gold', 'Фокус', timerTime(s.focus), 'focus'],
    [
      'calendar-days',
      '',
      'Календарь',
      s.events.find((x) => !x.fired)
        ? timeLabel(s.events.filter((x) => !x.fired).sort((a, b) => a.time - b.time)[0].time)
        : 'Нет напоминаний',
      'events',
    ],
  ];
  $('#todayCards').innerHTML = rows
    .map(
      ([ic, cl, k, v, id]) =>
        '<button class="dayCard" data-act="day" data-id="' +
        id +
        '"><i class="swatch ' +
        cl +
        '">' +
        ico(ic) +
        '</i><div><small>' +
        esc(k) +
        '</small><strong ' +
        (id === 'focus' ? 'data-clock' : '') +
        '>' +
        esc(v) +
        '</strong></div><i>' +
        ico('chevron-right') +
        '</i></button>',
    )
    .join('');
}
function renderChat() {
  const chat = state.chats.find((c) => c.id === current),
    has = Boolean(chat?.messages.length || sending);
  $('#chatBox').hidden = !has;
  $('#welcome').hidden = has;
  $('#hero').classList.toggle('chatting', has);
  if (has) {
    $('#chatTitle').textContent = chat?.title || 'Новый чат';
    $('#messages').innerHTML =
      (chat?.messages || [])
        .map(
          (m) =>
            '<div class="bubble ' +
            esc(m.role) +
            (m.error ? ' error' : '') +
            '">' +
            esc(m.text) +
            (m.sources || [])
              .map(
                (r, i) =>
                  '<button data-act="source" data-id="' +
                  esc(r.url) +
                  '">' +
                  (i + 1) +
                  '. ' +
                  esc(r.title) +
                  '</button>',
              )
              .join('') +
            (m.files || []).map((f) => btn(f.name, 'openFile', 'file-text', '', f.id)).join('') +
            '</div>',
        )
        .join('') + (sending ? '<div class="busy">Мира думает…</div>' : '');
    $('#messages').scrollTop = $('#messages').scrollHeight;
  }
  $('#send').innerHTML = ico(sending ? 'circle-stop' : 'arrow-up');
  $('#send').title = sending ? 'Остановить' : 'Отправить';
  $('#history').innerHTML =
    state.chats
      .filter((x) => x.messages.length || x.id === current)
      .map(
        (c) =>
          '<div class="historyRow"><button data-act="openChat" data-id="' +
          esc(c.id) +
          '">' +
          esc(c.title) +
          '</button><button data-act="deleteChat" data-id="' +
          esc(c.id) +
          '" title="Удалить">' +
          ico('trash-2') +
          '</button></div>',
      )
      .join('') || '<p class="empty">Разговоры сохраняются здесь.</p>';
}
function render() {
  syncMotionTimer();
  if (!state) return;
  const look = state.settings;
  document.body.dataset.theme =
    look.theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'night'
        : 'cream'
      : look.theme;
  document.body.dataset.glass = String(!!look.glass);
  document.body.dataset.character = String(look.showAvatar);
  document.body.style.setProperty('--glow-alpha', (look.glow ?? 55) + '%');
  if (look.accent) document.body.style.setProperty('--accent', look.accent);
  else document.body.style.removeProperty('--accent');
  $('#area').dataset.page = page;
  $('#content').hidden = page === 'home';
  document
    .querySelectorAll('[data-go]')
    .forEach((b) =>
      b.classList.toggle(
        'active',
        b.dataset.go === page || (page === 'desk' && b.closest('nav') && b.dataset.go === 'home'),
      ),
    );
  $('#today').textContent = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  $('#heroName').textContent = state.settings.name;
  const h = new Date().getHours();
  $('#hello').textContent =
    (h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер') +
    (state.settings.user ? ', ' + state.settings.user : '') +
    '. О чём поговорим?';
  $('#initial').textContent = (state.settings.user || 'М')[0].toUpperCase();
  $('#profile').textContent = state.settings.user || 'Мой компьютер';
  $('#time').textContent = clock.format(new Date());
  const ready =
    state.settings.provider === 'local'
      ? state.models.some((m) => m.id === state.settings.model && m.installed)
      : Boolean(
          state.keys.includes('ai') || /^http:\/\/(localhost|127\.0\.0\.1)/.test(state.settings.base),
        );
  $('#services').innerHTML = [
    [ready, 'ИИ'],
    [true, 'Речь'],
    [state.settings.voice !== 'fish' || state.keys.includes('fish'), 'Голос'],
  ]
    .map(([b, t]) => '<span><i class="' + (b ? 'on' : '') + '"></i>' + t + '</span>')
    .join('');
  cards();
  renderChat();
  renderPage();
  renderFrame();
}
async function refresh() {
  const id = ++refreshId;
  const s = await call('state');
  if (id !== refreshId) return;
  pages.captureDraft(cache.draft);
  state = s;
  render();
}
async function refreshSystem() {
  try {
    cache.sys = await call('system');
    if (page === 'desk' && !$('dialog[open]')) renderPage();
  } catch {}
}
const val = (id) => $('#' + id)?.value || '';
function modal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal() {
  if ($('#modal').open) $('#modal').close();
}
function err(e) {
  toast(e.message || e);
}
async function send(input, voiceMode = false) {
  if (sending) return;
  let text = String(input || '').trim();
  if (!text && !attachment) return;
  if (attachment) {
    text += (text ? '\n\n' : '') + 'Файл ' + attachment.name + '\n' + attachment.text;
    attachment = null;
    $('#attachment').hidden = true;
  }
  nav('home');
  $('#prompt').value = '';
  sending = true;
  renderChat();
  phase('thinking', state.settings.reduced);
  try {
    if (!current) current = await call('newChat');
    const r = await call('send', { id: current, text, voiceMode });
    current = r.id;
    return r.text;
  } finally {
    sending = false;
    await refresh();
    phase(voice.enabled ? 'listening' : 'idle', state.settings.reduced);
  }
}
async function toggleVoice() {
  if (voice.enabled) {
    voice.stop();
    return;
  }
  nav('home');
  await voice.start();
}
function newChat() {
  if (sending) return;
  current = '';
  attachment = null;
  $('#attachment').hidden = true;
  nav('home');
  $('#prompt').focus();
}
async function saveSettings(data) {
  await call('settings', data);
  await refresh();
}
function loadDraft(id) {
  const r = state.routines.find((r) => r.id === id);
  cache.draft = r ? structuredClone(r) : pages.newRoutine();
  cache.node = 0;
  renderPage();
}
async function saveRoutine() {
  pages.captureDraft(cache.draft);
  const id = await call('saveRoutine', cache.draft);
  cache.draft.id = id;
  await refresh();
  return id;
}
async function handle(action, id) {
  if (action?.startsWith('remove-')) {
    await call('remove', { kind: action.slice(7), id });
    return;
  }
  if (action?.startsWith('add-')) {
    const k = action.slice(4);
    modal(
      { tasks: 'Новая задача', events: 'Новое напоминание', notes: 'Новая заметка' }[k],
      field('Текст', 'itemText') +
        (k === 'events' ? field('Дата и время', 'itemTime', '', 'datetime-local') : '') +
        btn('Сохранить', 'commitItem', 'check', 'primary', k),
    );
    $('#itemText').focus();
    return;
  }
  switch (action) {
    case 'commitItem':
      await call('add', { kind: id, text: val('itemText'), time: new Date(val('itemTime')).getTime() });
      closeModal();
      return;
    case 'day':
      nav('desk');
      if (id === 'tasks' || id === 'events') {
        const panels = [...$('#content').querySelectorAll('.box')];
        panels
          .find((p) => p.querySelector('[data-act="add-' + id + '"]'))
          ?.scrollIntoView({ block: 'nearest' });
      }
      return;
    case 'toggleTask':
      await call('toggleTask', { id });
      return;
    case 'focusToggle':
      await call('focus', {
        action: state.focus.ends ? 'pause' : state.focus.remaining > 0 ? 'resume' : 'start',
        minutes: 25,
      });
      return;
    case 'focusReset':
      await call('focus', { action: 'reset' });
      return;
    case 'focusCustom':
      modal(
        'Сколько минут?',
        field('Длительность', 'mins', '25', 'number') + btn('Начать', 'startFocus', 'play', 'primary'),
      );
      return;
    case 'startFocus':
      await call('focus', { action: 'start', minutes: +val('mins') || 25 });
      closeModal();
      return;
    case 'weather':
      cache.weather = await call('weather');
      renderPage();
      return;
    case 'rates':
      cache.rates = await call('rates');
      renderPage();
      return;
    case 'source':
      await call('url', { url: id });
      return;
    case 'openChat':
      current = id;
      nav('home');
      return;
    case 'deleteChat':
      modal('Удалить этот разговор?', btn('Удалить', 'confirmDelete', 'trash-2', 'danger', id));
      return;
    case 'confirmDelete':
      await call('deleteChat', { id });
      if (current === id) current = '';
      closeModal();
      await refresh();
      return;
    case 'openFile':
      await call('openFile', { id });
      return;
    case 'find':
      modal(
        'Поиск на ПК',
        field('Имя файла в выбранных папках', 'fileQ') +
          btn('Найти', 'findGo', 'search', 'primary') +
          '<div id="found"></div>',
      );
      return;
    case 'findGo': {
      const found = await call('find', { query: val('fileQ') });
      $('#found').innerHTML =
        found
          .map(
            (f) =>
              '<div class="entry"><span>' +
              esc(f.name) +
              '<br><small>' +
              esc(f.folder) +
              '</small></span>' +
              btn('Открыть', 'openFile', '', '', f.id) +
              '</div>',
          )
          .join('') || '<p class="empty">Совпадений нет.</p>';
      return;
    }
    case 'voice':
      return toggleVoice();
    case 'music':
    case 'voiceFile':
    case 'avatar':
    case 'linkFile':
    case 'linkFolder': {
      const kind = {
        music: 'music',
        voiceFile: 'voice',
        avatar: 'avatar',
        linkFile: 'file',
        linkFolder: 'folder',
      }[action];
      const item = await call('import', { kind });
      if (item) {
        if (kind === 'music') music.dataset.name = '';
        await refresh();
      }
      return;
    }
    case 'showAvatar':
      return saveSettings({ showAvatar: !state.settings.showAvatar });
    case 'seat':
      await call('seat');
      await refresh();
      return;
    case 'overlay':
      await call('overlay', { open: !state.overlay });
      await refresh();
      return;
    case 'dance':
      avatar()?.dance();
      await call('motion', { id: 'dance' });
      return;
    case 'replay':
      avatar()?.replayGesture();
      await call('motion', { id: cache.gesture });
      return;
    case 'settings':
      nav('settings');
      return;
    case 'audition':
      await voice.speak('Привет! Я рядом. Давай немного поговорим.');
      return;
    case 'keyFish':
    case 'keySearch':
    case 'keyTelegram': {
      const [name, input] = {
        keyFish: ['fish', 'fishKey'],
        keySearch: ['search', 'searchKey'],
        keyTelegram: ['telegram', 'tgKey'],
      }[action];
      await call('key', { name, value: val(input) });
      toast('Настройка сохранена');
      return;
    }
    case 'fishSearch':
    case 'fishNext':
      cache.fishQuery = val('fishQuery');
      cache.fishPage = action === 'fishNext' ? (cache.fishPage || 1) + 1 : 1;
      cache.fishList = await call('fish', { query: cache.fishQuery, page: cache.fishPage });
      renderPage();
      return;
    case 'fishPick':
      await saveSettings({ voice: 'fish', fishVoice: id });
      return;
    case 'saveAI': {
      const base = val('base'),
        cloudModel = val('cloudModel'),
        key = val('aiKey');
      await saveSettings({ base, cloudModel, provider: 'endpoint' });
      if (key) await call('key', { name: 'ai', value: key });
      toast('Подключение сохранено');
      return;
    }
    case 'saveRole':
      return saveSettings({ role: val('role') });
    case 'searchNow':
      nav('home');
      $('#prompt').value = 'Найди в интернете ';
      $('#prompt').focus();
      return;
    case 'download':
      await call('download', { id });
      await refresh();
      return;
    case 'pauseDownload':
      await call('pauseDownload');
      return;
    case 'removeModel':
      await call('removeModel', { id });
      return;
    case 'useModel':
      return saveSettings({ provider: 'local', model: id });
    case 'motionOutput': {
      const port = state.motionPort ? 0 : Number(val('motionPort'));
      if (!state.motionPort && (!Number.isInteger(port) || port < 1 || port > 65535))
        throw Error('Укажи порт от 1 до 65535');
      await call('motionOutput', { port });
      await refresh();
      return;
    }
    case 'exportAvatar':
      if (await call('exportAvatar')) toast('Модель сохранена');
      return;
    case 'pickTheme':
      return saveSettings({ theme: id });
    case 'resetAccent':
      return saveSettings({ accent: '' });
    case 'saveProfile':
      return saveSettings({ name: val('name'), user: val('user'), city: val('city') });
    case 'hotkey':
      return saveSettings({ hotkey: val('hotkey') });
    case 'edit':
      loadDraft(id);
      return;
    case 'newRoutine':
      loadDraft('');
      return;
    case 'workshop':
      nav('plugins');
      return;
    case 'layoutNodes':
      pages.captureDraft(cache.draft);
      for (const b of cache.draft.blocks) {
        delete b.x;
        delete b.y;
      }
      renderPage();
      return;
    case 'expandNodes':
      pages.captureDraft(cache.draft);
      cache.expanded = !cache.expanded;
      renderPage();
      return;
    case 'addBlock': {
      pages.captureDraft(cache.draft);
      const kind = val('kind');
      const fallback =
        {
          wait: '2',
          focus: '25',
          repeat: '2',
          ifTime: '09-18',
          switchTheme: 'cream',
          theme: 'cream',
          keys: 'copy',
        }[kind] || '';
      cache.draft.blocks.push({
        kind,
        value: fallback,
        alternate: Math.max(0, cache.draft.blocks.length - 1),
      });
      cache.node = cache.draft.blocks.length - 1;
      renderPage();
      return;
    }
    case 'drop':
    case 'up':
    case 'down': {
      pages.captureDraft(cache.draft);
      const i = Number(id),
        d = cache.draft;
      if (action === 'drop') {
        d.blocks.splice(i, 1);
        for (const b of d.blocks) {
          for (const k of ['next', 'alternate']) if (b[k] > i) b[k]--;
        }
      } else pages.reorder(d, i, i + (action === 'up' ? -1 : 1));
      renderPage();
      return;
    }
    case 'saveRoutine':
      await saveRoutine();
      toast('Команда сохранена');
      return;
    case 'runRoutine': {
      const key = await saveRoutine();
      toast(await call('run', { id: key }));
      return;
    }
    case 'cancelRun':
      await call('cancelRun');
      return;
    case 'exportRoutine':
      await call('exportRoutine', { id: await saveRoutine() });
      return;
    case 'removeRoutine':
      await call('removeRoutine', { id: cache.draft.id });
      cache.draft = null;
      await refresh();
      return;
    case 'pack':
      await call('pack', { id });
      toast('Набор добавлен в команды');
      return;
    case 'removePack':
      await call('removePack', { id });
      return;
    case 'importPack':
      if (await call('importPack')) toast('Команды импортированы');
      return;
    case 'pair': {
      const r = await call('pair');
      modal(
        'Подключить личный чат',
        '<p>Открой своего бота и нажми «Запустить» в течение пяти минут.</p><div class="actions">' +
          btn(
            'Открыть @' + r.bot,
            'source',
            'external-link',
            'primary',
            'https://t.me/' + r.bot + '?start=' + r.code,
          ) +
          '</div>',
      );
      return;
    }
    case 'unpair':
      await call('unpair');
      return;
    case 'community':
      cache.community = await call('community', { url: val('catalogURL') });
      renderPage();
      return;
    case 'communityInstall':
      await call('communityInstall', { id });
      await refresh();
      return;
    case 'newMcp':
      modal(
        'Подключить MCP-сервер',
        field('Название', 'mcpName') +
          field('Адрес Streamable HTTP', 'mcpUrl') +
          field('Bearer-токен, если требуется', 'mcpToken', '', 'password') +
          btn('Подключить', 'saveMcp', 'link', 'primary'),
      );
      return;
    case 'saveMcp':
      await call('addMCP', { name: val('mcpName'), url: val('mcpUrl'), token: val('mcpToken') });
      closeModal();
      return;
    case 'mcpList': {
      const result = await call('mcp', { id });
      cache.tools = result.tools || [];
      cache.server = id;
      modal(
        'Инструменты сервера',
        cache.tools
          .map(
            (t, i) =>
              '<div class="entry"><span>' +
              esc(t.name) +
              '<br><small>' +
              esc(t.description || '') +
              '</small></span>' +
              btn('Открыть', 'mcpForm', 'chevron-right', '', i) +
              '</div>',
          )
          .join('') || 'Сервер не вернул инструменты',
      );
      return;
    }
    case 'mcpForm': {
      const t = cache.tools[Number(id)];
      modal(
        t.name,
        '<p class="muted">' +
          esc(t.description || '') +
          '</p><details><summary>Параметры инструмента</summary><pre>' +
          esc(JSON.stringify(t.inputSchema, null, 2)) +
          '</pre></details><label class="field">Аргументы JSON<textarea id="toolArgs">{}</textarea></label>' +
          btn('Выполнить', 'mcpRun', 'play', 'primary', id) +
          '<pre id="toolResult"></pre><div id="toolDiscuss"></div>',
      );
      return;
    }
    case 'mcpRun': {
      const r = await call('mcp', {
        id: cache.server,
        tool: cache.tools[+id].name,
        args: JSON.parse(val('toolArgs')),
      });
      $('#toolResult').textContent = (r.content || [])
        .map((c) => c.text || c.type)
        .join('\n')
        .slice(0, 30000);
      $('#toolDiscuss').innerHTML = btn('Обсудить с Мирой', 'discussTool', 'message-circle');
      return;
    }
    case 'discussTool': {
      const result = $('#toolResult').textContent;
      closeModal();
      nav('home');
      $('#prompt').value = result;
      $('#prompt').focus();
      return;
    }
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.go) {
    nav(b.dataset.go);
    return;
  }
  if (b.dataset.dismiss === 'modal') {
    closeModal();
    return;
  }
  if (b.dataset.dismiss === 'drawer') {
    $('#drawer').hidden = true;
    return;
  }
  if (b.dataset.win) {
    call('window', { action: b.dataset.win }).catch(err);
    return;
  }
  if (b.dataset.act) handle(b.dataset.act, b.dataset.id).catch(err);
});
document.addEventListener('change', (e) => {
  const v = e.target.value;
  const settings = {
    accent: { accent: v },
    glow: { glow: +v },
    glass: { glass: v === 'on' },
    avatarPick: { avatar: v },
    voicePick: { voice: v },
    sysVoice: { systemVoice: v },
    theme: { theme: v },
    fps: { fps: +v },
    reduced: { reduced: v === 'on' },
    provider: { provider: v },
  }[e.target.id];
  if (settings) {
    saveSettings(settings).catch(err);
    return;
  }
  if (e.target.id === 'preset' && v) $('#base').value = v;
  if (e.target.id === 'gesture') {
    cache.gesture = v;
    avatar()?.configureChoreography(v);
    call('motion', { id: v }).catch(err);
  }
  if (e.target.id === 'emotion') {
    cache.emotion = v;
    avatar()?.configurePerformance({ emotion: v || 'auto', variant: -1 });
  }
});
let moving = null;
$('#content').addEventListener('pointerdown', (e) => {
  const n = e.target.closest('button[data-node]');
  if (!n || e.button !== 0) return;
  pages.captureDraft(cache.draft);
  const index = +n.dataset.node;
  moving = {
    index,
    startX: e.clientX,
    startY: e.clientY,
    x: n.offsetLeft,
    y: n.offsetTop,
    node: n,
    moved: false,
  };
  n.setPointerCapture(e.pointerId);
});
$('#content').addEventListener('pointermove', (e) => {
  if (!moving) return;
  const m = moving,
    dx = e.clientX - m.startX,
    dy = e.clientY - m.startY;
  if (Math.abs(dx) + Math.abs(dy) > 4) m.moved = true;
  if (m.moved) {
    m.node.style.left = Math.max(4, m.x + dx) + 'px';
    m.node.style.top = Math.max(4, m.y + dy) + 'px';
  }
});
$('#content').addEventListener('pointerup', () => {
  if (!moving) return;
  const m = moving;
  moving = null;
  cache.node = m.index;
  if (m.moved) {
    const b = cache.draft.blocks[m.index];
    b.x = m.node.offsetLeft;
    b.y = m.node.offsetTop;
  }
  renderPage();
});
$('#content').addEventListener('keydown', (e) => {
  const n = e.target.closest('button[data-node]');
  if (n && ['Enter', ' '].includes(e.key)) {
    e.preventDefault();
    pages.captureDraft(cache.draft);
    cache.node = +n.dataset.node;
    renderPage();
  }
});
$('#messageForm').onsubmit = (e) => {
  e.preventDefault();
  if (sending) {
    call('stop');
    return;
  }
  send(val('prompt')).catch(err);
};
$('#prompt').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $('#messageForm').requestSubmit();
  }
};
$('#attach').onclick = async () => {
  try {
    const a = await call('import', { kind: 'attachment' });
    if (a) {
      attachment = a;
      $('#attachment').hidden = false;
      $('#attachment').textContent = a.name + ' ×';
    }
  } catch (e) {
    err(e);
  }
};
$('#attachment').onclick = () => {
  attachment = null;
  $('#attachment').hidden = true;
};
$('#mic').onclick = $('#voiceStart').onclick = () => toggleVoice().catch(err);
$('#voiceEnd').onclick = () => voice.stop();
$('#focusQuick').onclick = () => handle('focusCustom').catch(err);
$('#searchQuick').onclick = () => handle('searchNow');
$('#topOverlay').onclick = () => handle('overlay').catch(err);
$('#dance').onclick = () => handle('dance').catch(err);
$('#historyBtn').onclick = () => {
  $('#drawer').hidden = !$('#drawer').hidden;
};
$('#newChat').onclick = newChat;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#drawer').hidden = true;
    if (voice.enabled) voice.stop();
  }
});
window.desk.on(async (e) => {
  try {
    if (e.type === 'refresh' || e.type === 'models' || e.type === 'downloaded') {
      await refresh();
      return;
    }
    if (e.type === 'download') {
      cache.progress = e;
      if (!busyDownload && page === 'ai') {
        busyDownload = true;
        setTimeout(() => {
          busyDownload = false;
          if (page === 'ai' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName))
            refresh().catch(err);
        }, 500);
      }
      return;
    }
    if (e.type === 'downloadEnd' || e.type === 'notice') {
      toast(e.message);
      return;
    }
    if (e.type === 'toggleVoice') {
      await toggleVoice();
      return;
    }
    if (e.type === 'stopAudio') {
      voice.hush();
      return;
    }
    if (e.type === 'say') {
      try {
        await voice.speak(e.text);
        await call('spoken', { id: e.id });
      } catch (ex) {
        await call('spoken', { id: e.id, error: ex.message });
        throw ex;
      }
      return;
    }
    if (e.type === 'dance') {
      avatar()?.dance();
      return;
    }
    if (e.type === 'playMusic') {
      setMusic();
      await music.play();
      return;
    }
    if (e.type === 'results') {
      externalResults = e.results;
      modal(e.query, e.results.map((r) => btn(r.title, 'source', 'external-link', '', r.url)).join(''));
      return;
    }
    if (e.type === 'decode') {
      await call('decoded', { id: e.id, bytes: await voice.decode(e.bytes) });
    }
  } catch (ex) {
    err(ex);
  }
});
let motionTimer = null;
function syncMotionTimer() {
  if (state?.motionPort && !motionTimer) {
    let inFlight = false;
    motionTimer = setInterval(async () => {
      if (inFlight) return;
      const frame = avatar()?.readMotionFrame?.();
      if (!frame) return;
      inFlight = true;
      try {
        await call('motionFrame', frame);
      } catch (ex) {
        err(ex);
      } finally {
        inFlight = false;
      }
    }, 1000 / 30);
  } else if (!state?.motionPort && motionTimer) {
    clearInterval(motionTimer);
    motionTimer = null;
  }
}
setInterval(() => {
  if (!state) return;
  const meter = $('#frameMeter'),
    stats = avatar()?.frameStats;
  if (meter)
    meter.textContent = stats
      ? 'Отрисовка · ' +
        Math.round(stats.fps) +
        ' кадр/с · 95% кадров до ' +
        Math.round(stats.p95ms) +
        ' мс'
      : '';

  $('#time').textContent = clock.format(new Date());
  document.querySelectorAll('[data-clock]').forEach((el) => (el.textContent = timerTime(state.focus)));
}, 1000);
setInterval(() => {
  if (page === 'desk' && !document.hidden) refreshSystem();
}, 6500);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state?.settings.theme === 'system') render();
});
async function boot() {
  const [s, cat] = await Promise.all([
    call('state'),
    fetch('/renderer/choreography.json').then((r) => r.json()),
  ]);
  state = s;
  cache.catalog = cat;
  current = state.chats[0]?.id || '';
  render();
  setupAvatar();
}
boot().catch(err);
