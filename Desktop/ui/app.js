import {
  rollingNumber,
  appear,
  changeSurface,
  rowChanges,
  setReduced,
  streamText,
  motionEnabled,
} from './motion.js';
import { navigation } from './navigation.js';
import { applyPalette } from './themes.mjs';
import './error-journal.js';
import { updateBackdrop } from './backgrounds.js';
import { WakeGate } from './wake.mjs';
import { syncCat } from './cat.js';
import {
  $,
  esc,
  ico,
  call,
  icons,
  btn,
  field,
  select,
  toast,
  reportError as err,
  recordError,
  timeLabel,
  timerTime,
  avatar,
  phase,
} from './shared.js';
import * as pages from './pages.js';
import { noteLabel, sortedNotes, taskListOf } from './note-format.mjs';
import { boardSizing } from './board-sizing.js';
import { commands, parseCommand } from './chat-commands.mjs';
import { Voice } from './audio.js';
import { canRevise } from './chat-history.mjs';
import { openOrganizer, syncOrganizer } from './organizer.js';
import { openMail } from './mail.js';
import { openAgenda, syncAgenda } from './agenda.js';
import { desktopTools } from './extras.js';
import { startTour } from './tour.js';
import { openSetup } from './setup.js';
let state,
  page = 'home',
  current = '',
  sending = false,
  streamId = null,
  liveReply = '',
  attachments = [],
  draftEpoch = 0,
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
const wakeGate = new WakeGate();
let wakeTimer,
  lastMicMode = 'off';
const voice = new Voice(
  async (text, startedAt) => {
    const question = wakeGate.accept(text, state.settings.wakeAlias, startedAt);
    clearTimeout(wakeTimer);
    if (wakeGate.pending())
      wakeTimer = setTimeout(() => {
        if (voice.enabled && !voice.recording && !voice.busy)
          voice.onStatus('Слушаю. Можно говорить.', 'listening');
      }, 10001);
    if (!question) return;
    voice.onStatus('Думаю…', 'thinking');
    return send(question, true);
  },
  (msg, p) => {
    renderServices();
    if (voice.testing) return;
    const mode = voice.enabled
      ? wakeGate.pending() || sending || voice.playing
        ? 'talking'
        : 'waiting'
      : 'off';
    if (mode !== lastMicMode) {
      lastMicMode = mode;
      call('micMode', { mode }).catch(err);
    }
    if (voice.enabled && voice.transcribing && !wakeGate.pending()) {
      msg = 'Жду обращения «' + (state?.settings.wakeAlias || 'Мира') + '»';
      p = 'listening';
    }
    if (voice.enabled && msg && p === 'listening' && !voice.recording)
      msg = wakeGate.pending()
        ? 'Слушаю вопрос…'
        : 'Жду обращения «' + (state?.settings.wakeAlias || 'Мира') + '»';
    liveStatus = msg;
    $('#voiceStatus').textContent = msg;
    $('#voiceBar').hidden = !msg;
    $('#voiceBar').dataset.phase = p;
    $('#voiceStart').innerHTML = ico('mic') + (voice.enabled ? 'Завершить разговор' : 'Включить микрофон');
    phase(p, state?.settings.reduced || false);
  },
  err,
  (startedAt) => !wakeGate.pending(startedAt),
  (text) => !!wakeGate.match(text, state?.settings.wakeAlias),
);
let meterAt = 0;
voice.onMeter = (rms, label) => {
  if (page !== 'voice' || (rms && performance.now() - meterAt < 90)) return;
  meterAt = performance.now();
  const meter = $('#micLevel'),
    out = $('#micReading');
  if (!meter || !out) return;
  const db = Math.max(-60, 20 * Math.log10(Math.max(rms, 0.001)));
  meter.value = (db + 60) / 60;
  out.textContent = label ? label + ' · ' + Math.round(db) + ' дБ' : 'Проверка микрофона';
};
async function refreshAudioDevices() {
  const devices = await voice.devices();
  cache.audioDevices = devices;
  cache.testingMic = voice.testing;
  if (page === 'voice') renderPage();
}
navigator.mediaDevices?.addEventListener('devicechange', () => {
  if (state?.settings.introDone && !$('#intro').open) listenOnOpen();
  if (page === 'voice' || voice.enabled) refreshAudioDevices().catch(err);
});
const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const drawNav = navigation(pages.names, pages.tabIcons, saveSettings, err);
icons();
const avatarFrame = $('#avatar');
let avatarReadyTimer;
function setupAvatar() {
  clearTimeout(avatarReadyTimer);
  avatarReadyTimer = undefined;
  if (!state || (!sceneVisible() && !state.motionPort)) return;
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
  a.setActive(sceneVisible());
}
avatarFrame.addEventListener('load', () => {
  if (state) setupAvatar();
});
function sceneVisible() {
  return Boolean((page === 'model' && cache.modelPreview) || (page === 'home' && state.settings.showAvatar));
}
function renderFrame() {
  const visible = sceneVisible();
  $('#area').classList.toggle('previewingModel', page === 'model' && visible);
  $('#scene').hidden = !visible;
  const a = avatar();
  const appearance = state.settings.avatar + '/' + (state.settings.outfit || 'original');
  if (lastAvatar !== appearance) {
    if (lastAvatar) avatarFrame.src = '/renderer/index.html?character=' + encodeURIComponent(appearance);
    lastAvatar = appearance;
  }
  a?.setMotionOutput(!!state.motionPort);
  a?.setActive(visible);
  if ((visible || state.motionPort) && !a?.ready && !avatarReadyTimer) setupAvatar();
  a?.setFrameRate(state.settings.fps);
  $('#nameplate span').textContent = state.settings.name;
  avatarFrame.title = state.settings.name;
}
function nav(next) {
  if (!pages.names[next]) return;
  if ($('#navMenu').matches(':popover-open')) $('#navMenu').hidePopover();
  if (next !== 'home') closeSlash();
  if (voice.testing && next !== 'voice') {
    voice.stop(false);
    cache.testingMic = false;
  }
  if (next !== 'voice' && cache.previewId) {
    cache.previewVersion++;
    cache.previewId = '';
    voice.hush();
    voice.onStatus(voice.enabled ? 'Слушаю. Можно говорить.' : '', voice.enabled ? 'listening' : 'idle');
  }
  pages.captureDraft(cache.draft);
  cache.openWidget = null;
  drawWidget();
  if (page !== next) $('#content').scrollTop = 0;
  page = next;
  $('#home').classList.remove('widgets-open');
  $('#panelWidgets').setAttribute('aria-expanded', 'false');
  setHistory(false);
  render();
  if (page === 'desk') refreshSystem();
  if (page === 'voice') refreshAudioDevices().catch(err);
  if (page === 'voice' && !cache.sysVoices)
    call('systemVoices')
      .then((v) => {
        cache.sysVoices = v;
        if (page === 'voice') renderPage();
      })
      .catch(() => {});
}
function drawWidget() {
  const drawer = $('#widgetDrawer');
  drawer.hidden = !cache.openWidget;
  if (!cache.openWidget) {
    $('#widgetBody').replaceChildren();
    return;
  }
  $('#widgetBody').innerHTML = pages.desk(state, cache, cache.openWidget);
  if (cache.openWidget === 'music' && state.music) {
    setMusic();
    $('#widgetBody #musicSlot')?.append(music);
  }
}
const sectionNav = $('#sectionNav');
const pageContent = $('#content');
let pageSections = [];

function markSection(active) {
  for (const { button, heading } of pageSections) {
    if (heading === active) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
}

function updateSection() {
  if (sectionNav.hidden) return;
  const viewport = pageContent.getBoundingClientRect();
  let active = pageSections[0]?.heading;
  for (const { heading } of pageSections) {
    if (heading.getBoundingClientRect().top > viewport.top + 42) break;
    active = heading;
  }
  if (pageContent.scrollTop > 0 &&
      pageContent.scrollHeight - pageContent.clientHeight - pageContent.scrollTop <= 2)
    active = pageSections.at(-1)?.heading;
  markSection(active);
}

function sections() {
  const allowed = ['voice', 'ai', 'settings', 'plugins'].includes(page);
  pageSections = allowed
    ? Array.from(pageContent.querySelectorAll('article.box:not([hidden]) > h3'), (heading, index) => {
        const button = document.createElement('button');
        heading.id = 'page-section-' + index;
        button.type = 'button';
        button.dataset.section = heading.id;
        button.setAttribute('aria-controls', heading.id);
        const icon = heading.querySelector('svg')?.cloneNode(true);
        if (icon) button.append(icon);
        const label = document.createElement('span');
        label.textContent = heading.textContent;
        button.append(label);
        return { button, heading };
      })
    : [];
  sectionNav.hidden = !pageSections.length;
  sectionNav.replaceChildren(...pageSections.map(({ button }) => button));
  updateSection();
}

function filterPreferences() {
  const query = (cache.preferencesQuery || '').trim().toLocaleLowerCase();
  let count = 0;
  for (const card of pageContent.querySelectorAll('article.box')) {
    card.hidden = !card.textContent.toLocaleLowerCase().includes(query);
    if (!card.hidden) count++;
  }
  $('#prefsEmpty').hidden = count > 0;
}

pageContent.addEventListener('scroll', updateSection, { passive: true });
pageContent.addEventListener('error', (event) => {
  if (event.target.classList?.contains('voiceCover')) event.target.hidden = true;
}, true);
sectionNav.onclick = (event) => {
  const target = event.target.closest('button');
  const heading = pageSections.find(({ button }) => button === target)?.heading;
  if (!heading) return;
  const card = heading.parentElement;
  const top = pageContent.scrollTop + card.getBoundingClientRect().top -
    pageContent.getBoundingClientRect().top - 10;
  pageContent.scrollTo({ top, behavior: motionEnabled() ? 'smooth' : 'instant' });
  markSection(heading);
};
function boardRows(inner, height) {
  // Reserve the card border and gutter in the grid's one-pixel rows.
  const rows = 'span ' + Math.ceil(height + 2 + 12);
  if (inner.parentElement.style.gridRowEnd !== rows) inner.parentElement.style.gridRowEnd = rows;
}
const boardObserver = new ResizeObserver((entries) => {
  for (const { target, borderBoxSize } of entries)
    if (target.isConnected) boardRows(target, borderBoxSize[0]?.blockSize ?? target.offsetHeight);
});
function renderPage() {
  if (page === 'desk' && sizingBoard()) return;
  const handleId =
    document.activeElement?.dataset.act === 'boardResize' ? document.activeElement.dataset.id : null;
  boardObserver.disconnect();
  if (page === 'home') {
    sections();
    return;
  }
  const previous = $('#content').scrollTop;
  $('#content').classList.toggle('expandedGraph', page === 'commands' && !!cache.expanded);
  const quick = $('#quickTask');
  const cursor =
    quick && document.activeElement === quick ? [quick.selectionStart, quick.selectionEnd] : null;
  if (quick) quick.onblur = null;
  const managedInputs = page === 'voice' ? ['fishQuery', 'fishKey'] : page === 'settings' ? ['prefsQuery'] : [];
  const typing = managedInputs.includes(document.activeElement?.id) ? document.activeElement : null;
  cache.fishKeyFocus = typing?.id === 'fishKey' || !!$('.fishAccess[open]');
  const content = $('#content');
  const subpage =
    page === 'voice'
      ? cache.fishTab || 'search'
      : page === 'model'
        ? cache.modelTab || ''
        : page === 'commands'
          ? cache.commandTab || 'editor'
          : '';
  const subpageChanged = content.dataset.motionPage === page && content.dataset.subpage !== subpage;
  content.dataset.motionPage = page;
  content.dataset.subpage = subpage;
  const toggleBefore = content.querySelector('.companionBar [role=switch]')?.getAttribute('aria-checked');
  const listMotion =
    page === 'commands' || page === 'desk'
      ? rowChanges(
          content,
          page === 'desk' ? '.boardTile' : '.flowNode[data-node]',
          page + '/' + (cache.draft?.id || '') + '/' + (cache.commandTab || ''),
        )
      : null;
  if (!listMotion) delete content.dataset.motionGroup;
  content.innerHTML = pages[page](state, cache);
  listMotion?.();
  if (subpageChanged) {
    const target = content.querySelector(
      page === 'voice'
        ? '.fishRows'
        : page === 'model'
          ? '.modelSections + .stack'
          : '.workflow, .commandPreferences',
    );
    appear(target, { opacity: 0, translate: page === 'voice' ? '0 10px' : '0 4px' }, 200);
  }
  const toggle = content.querySelector('.companionBar [role=switch]');
  if (toggle && toggleBefore && toggleBefore !== toggle.getAttribute('aria-checked') && motionEnabled()) {
    const thumb = toggle.querySelector('i');
    thumb.classList.add(toggleBefore === 'true' ? 'slidingOff' : 'slidingOn');
  }
  if (typing) {
    const next = document.getElementById(typing.id);
    next.value = typing.value;
    next.focus({ preventScroll: true });
    next.setSelectionRange(typing.selectionStart, typing.selectionEnd);
  }
  if (page === 'desk') {
    const input = $('#quickTask');
    if (input) {
      input.oninput = () => {
        if (cache.quickTask) cache.quickTask.text = input.value;
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          finishQuickTask(e.key === 'Escape').catch(err);
        }
      };
      input.onblur = () => finishQuickTask(false).catch(err);
      if (cursor) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(...cursor);
      }
    }
    $('#boardMenu').ontoggle = () =>
      $('#panelWidgets').setAttribute('aria-expanded', String(!!$('#boardMenu')?.matches(':popover-open')));
    // Set the first layout before paint, including when a background refresh replaces the grid.
    const sizes = Array.from(document.querySelectorAll('.tileInner'), (inner) => [
      inner,
      inner.getBoundingClientRect().height,
    ]);
    for (const [inner, height] of sizes) {
      boardRows(inner, height);
      boardObserver.observe(inner);
    }
    if (handleId)
      $('#content [data-act=boardResize][data-id="' + CSS.escape(handleId) + '"]')?.focus({
        preventScroll: true,
      });
  }
  if (page === 'desk' && state.music && $('#musicSlot')) {
    setMusic();
    $('#musicSlot').append(music);
  }
  if (page === 'settings') filterPreferences();
  $('#content').scrollTop = previous;
  sections();
  if (page === 'commands') filterCommandList();
}
function setMusic() {
  if (state.music && music.dataset.name !== state.music.name) {
    music.src = 'mira://desk/music?track=' + encodeURIComponent(state.music.name);
    music.dataset.name = state.music.name;
  }
}
music.addEventListener('play', () => {
  avatar()?.dance();
  call('motion', { id: 'dance', temporary: true });
});
function cards() {
  const s = state;
  const meta = {
    clock: ['clock-3', '', clock.format(new Date())],
    focus: ['timer', 'gold', timerTime(s.focus)],
    tasks: [
      'list-checks',
      'green',
      s.tasks.filter((t) => !t.done && taskListOf(t) === s.activeTaskList).length + ' в списке',
    ],
    reminders: [
      'calendar-days',
      '',
      s.events.filter((e) => !e.fired && !e.disabled && e.category !== 'calendar').length + ' запланировано',
    ],
    events: [
      'calendar-days',
      '',
      s.events
        .filter((e) => !e.fired && e.category !== 'reminder')
        .sort((a, b) => a.time - b.time)
        .map((e) => timeLabel(e.time))[0] || 'Нет событий',
    ],
    mail: ['mail', '', s.mail.latest || (s.mail.boxes ? 'Входящие' : 'Ящик не подключён')],
    notes: ['notebook-pen', 'gold', s.notes.length ? noteLabel(sortedNotes(s.notes)[0]) : 'Записать заметку'],
    music: ['music-2', '', s.music?.name || 'Выбрать дорожку'],
    weather: [
      'cloud-sun',
      'gold',
      cache.weather
        ? Math.round(s.settings.degree === 'F' ? cache.weather.temp * 1.8 + 32 : cache.weather.temp) +
          '°' +
          s.settings.degree
        : s.settings.city,
    ],
    rates: ['banknote', 'green', s.settings.exchangeFrom + ' / ' + s.settings.exchangeTo],
    system: ['cpu', '', cache.sys ? cache.sys.ram + '% памяти' : 'Показания ПК'],
    launch: ['play', 'green', (s.shortcuts || []).length + ' ярлыков'],
    crypto: ['banknote', 'gold', s.settings.cryptoCoin],
  };
  const rows = s.settings.widgets
    .filter((w) => w.visible)
    .map(({ id }) => [meta[id][0], meta[id][1], s.widgetNames[id], meta[id][2], id]);
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
        (id === 'focus' ? 'data-clock' : id === 'clock' ? 'data-wall-time' : '') +
        '>' +
        esc(v) +
        '</strong></div><i>' +
        ico('chevron-right') +
        '</i></button>',
    )
    .join('');
}
let renderedChat, renderedTail, renderedBusy;
function renderChat() {
  const chat = state.chats.find((c) => c.id === current),
    has = Boolean(chat?.messages.length || sending);
  const stageChanged = $('#chatBox').hidden === has;
  $('#chatBox').hidden = !has;
  $('#welcome').hidden = has;
  if (stageChanged && page === 'home')
    appear($(has ? '#chatBox' : '#welcome'), { opacity: 0, translate: '0 6px' }, 200);
  $('#hero').classList.toggle('chatting', has);
  const tail = chat?.messages.at(-1)?.id;
  if (has && (current !== renderedChat || tail !== renderedTail || sending !== renderedBusy)) {
    const scroller = $('#messages'),
      follow =
        current !== renderedChat || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 36,
      previous = scroller.scrollTop;
    $('#chatTitle').textContent = chat?.title || 'Новый чат';
    const priorIds = new Set(
      [...scroller.querySelectorAll('[data-message-id]')].map((el) => el.dataset.messageId),
    );
    $('#messages').innerHTML =
      (chat?.messages || [])
        .map(
          (m, index) =>
            '<div class="bubble ' +
            esc(m.role) +
            (m.error ? ' error' : '') +
            '" data-message-id="' +
            esc(m.id) +
            '">' +
            esc(m.text) +
            (m.stopped ? '<small class="stoppedReply">Ответ остановлен</small>' : '') +
            (m.attachments || [])
              .map((item) =>
                item.kind === 'image'
                  ? '<button class="chatImage" data-act="viewChatImage" data-id="' +
                    esc(item.id) +
                    '"><img src="/chat-images/' +
                    esc(item.id) +
                    '" alt="' +
                    esc(item.name) +
                    '"></button>'
                  : '<details class="chatDoc"><summary>' +
                    esc(item.name) +
                    '</summary><pre>' +
                    esc(item.text) +
                    '</pre></details>',
              )
              .join('') +
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
            (m.draft ? btn('Открыть сценарий', 'openDraft', 'workflow', '', String(index)) : '') +
            (m.files || []).map((f) => btn(f.name, 'openFile', 'file-text', '', f.id)).join('') +
            (!sending && m.role === 'user' && canRevise(chat.messages[index + 1])
              ? '<div class="replyActions">' + btn('Изменить', 'editTurn', 'pencil', '', m.id) + '</div>'
              : '') +
            (!sending && canRevise(m)
              ? '<div class="replyActions">' +
                btn('Ответить заново', 'redoTurn', 'refresh-cw', '', m.id) +
                '</div>'
              : '') +
            (m.role === 'assistant' && !m.error
              ? '<div class="replyActions">' +
                btn('Копировать', 'copyMessage', 'copy', '', String(index)) +
                btn('В заметки', 'noteMessage', 'plus', '', String(index)) +
                '</div>'
              : '') +
            '</div>',
        )
        .join('') +
      (sending
        ? '<div id="liveReply" class="' +
          (liveReply ? 'bubble assistant' : 'busy') +
          '">' +
          (liveReply
            ? esc(liveReply)
            : '<span class="waitWave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>Мира думает…') +
          '</div>'
        : '');
    if (renderedChat === current || (sending && !priorIds.size)) {
      for (const el of scroller.querySelectorAll('[data-message-id]')) {
        if (!priorIds.has(el.dataset.messageId) && !(renderedBusy && el.classList.contains('assistant')))
          appear(el, { opacity: 0, translate: '0 -6px', scale: '.97' }, 350, 'ease-out');
      }
    }
    scroller.scrollTop = follow ? scroller.scrollHeight : previous;
  }
  renderedChat = current;
  renderedTail = tail;
  renderedBusy = sending;
  $('#send').innerHTML = ico(sending ? 'circle-stop' : 'arrow-up');
  $('#send').title = sending ? 'Остановить' : 'Отправить';
  $('#send').setAttribute('aria-label', $('#send').title);
  $('#messageForm').dataset.busy = String(sending);
  $('#historyTools').innerHTML =
    select(
      'Проект',
      'chatProject',
      [['', 'Без проекта'], ...(state.projects || []).map((x) => [x.id, x.name])],
      state.activeProject || '',
    ) +
    btn('Новый проект', 'addProject', 'plus') +
    (state.activeProject
      ? btn('Параметры проекта', 'editProject', 'sliders-horizontal') +
        btn('Редактор файлов', 'projectEditor', 'file-text') +
        btn('Убрать проект', 'delProject', 'x')
      : '');
  const history = $('#history');
  const animateHistory = rowChanges(
    history,
    '.historyRow',
    (state.activeProject || '') + '/' + $('#historyQuery').value,
  );
  history.innerHTML =
    state.chats
      .filter(
        (x) =>
          (x.project || '') === (state.activeProject || '') &&
          (x.messages.length || x.id === current) &&
          [x.title, ...x.messages.map((m) => m.text)].some((t) =>
            t?.toLocaleLowerCase().includes($('#historyQuery').value.trim().toLocaleLowerCase()),
          ),
      )
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
  animateHistory();
}
let modelActivity = { active: false, version: -1 };
function syncModelActivity(activity) {
  if (activity && activity.version >= modelActivity.version) modelActivity = activity;
}
function service(id, status, title, pressed) {
  const button = $(id);
  button.dataset.state = status;
  button.title = title;
  button.setAttribute('aria-label', button.textContent.trim() + '. ' + title);
  if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
}
function renderServices() {
  if (!state) return;
  const s = state.settings;
  $('#services').dataset.reduced = String(s.reduced);
  const aiReady =
    s.provider === 'local'
      ? state.models.some((m) => m.id === s.model && m.installed)
      : Boolean(
          s.cloudModel &&
            (state.keys.includes('ai') ||
              ['localhost', '127.0.0.1', '[::1]'].includes(new URL(s.base).hostname)),
        );
  let aiState = aiReady ? 'pending' : 'off';
  let aiLabel = aiReady ? 'Модель настроена' : 'Требуется настройка модели';
  if (modelActivity.active) {
    aiState = 'active';
    aiLabel = 'Модель обрабатывает запрос';
  } else if (modelActivity.health === 'error') {
    aiState = 'error';
    aiLabel = 'Не удалось получить ответ от модели';
  } else if (modelActivity.health === 'ready') {
    aiState = 'on';
    aiLabel = 'Модель готова';
  }
  service('#serviceAI', aiState, aiLabel + ' · Настройки ИИ');
  let micState = 'off';
  let micLabel = '';
  if (voice.recording || voice.transcribing) {
    micState = 'active';
    micLabel = voice.transcribing ? 'Распознаю фразу' : 'Слышу тебя';
  } else if (voice.enabled) {
    micState = voice.stream ? 'on' : 'pending';
    micLabel = voice.stream ? 'Микрофон включён' : 'Подключаю микрофон';
  }
  service(
    '#serviceMic',
    micState,
    (micLabel ? micLabel + ' · ' : '') +
      (voice.enabled ? 'Выключить прослушивание' : 'Включить прослушивание'),
    voice.enabled,
  );
  const enabled = s.ttsEnabled !== false;
  const output = $('#composerVoice');
  output.setAttribute('aria-pressed', String(enabled));
  output.title = enabled ? 'Отключить озвучку' : 'Включить озвучку';
  output.setAttribute('aria-label', output.title);
  const ready = s.voice !== 'fish' || (state.keys.includes('fish') && s.fishVoice);
  service(
    '#serviceVoice',
    voice.playing ? 'active' : !enabled ? 'off' : ready ? 'on' : 'pending',
    (voice.playing ? 'Озвучиваю · ' : enabled && !ready ? 'Настрой Fish Audio · ' : '') +
      (enabled ? 'Выключить озвучку' : 'Включить озвучку'),
    enabled,
  );
}
function render() {
  if (state) syncCat((state.pluginIds || []).includes('cat'), state.settings.reduced);
  syncMotionTimer();
  if (!state) return;
  const look = state.settings;
  setReduced(look.reduced);
  voice.settings = look;
  document.body.dataset.bubbles = String(look.bubbles);
  const theme =
    look.theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'night'
        : 'cream'
      : look.theme;
  applyPalette(document.body, theme, look.customColor);
  document.body.dataset.glass = String(!!look.glass);
  document.body.dataset.noBlur = String(look.disableBlur);
  document.body.dataset.windowButtons = String(look.windowButtonBackground);
  const closeButton = $('.window [data-win="close"]');
  closeButton.title = look.minimizeToTray ? 'Свернуть в трей' : 'Выйти из Миры';
  closeButton.setAttribute('aria-label', closeButton.title);
  document.body.dataset.character = String(look.showAvatar);
  document.body.style.setProperty('--glow-alpha', (look.glow ?? 55) + '%');
  if (look.accent) document.body.style.setProperty('--accent', look.accent);
  else document.body.style.removeProperty('--accent');
  drawNav(look.navTabs, page);
  $('#topOverlay').setAttribute('aria-pressed', String(state.overlay));
  $('#area').dataset.page = page;
  updateBackdrop(page === 'home', look.reduced);
  $('#content').hidden = page === 'home';
  document
    .querySelectorAll('[data-go]')
    .forEach((b) =>
      b.classList.toggle(
        'active',
        b.dataset.go === page || (page === 'desk' && b.closest('nav') && b.dataset.go === 'home'),
      ),
    );
  $('#chatModelName').textContent =
    look.provider === 'local'
      ? state.models.find((m) => m.id === look.model)?.name || 'Локальная модель'
      : look.cloudModel || 'Сервис ИИ';
  $('#heroName').textContent = look.name;
  $('#hello').textContent = state.settings.user ? 'Привет, ' + state.settings.user + '!' : 'С чего начнём?';
  $('#homeCharacter').setAttribute('aria-pressed', String(look.showAvatar));
  $('#recentChat').disabled = !state.chats.some((chat) => chat.messages.length);
  $('#initial').textContent = (state.settings.user || 'М')[0].toUpperCase();
  $('#profile').textContent = state.settings.user || 'Мой компьютер';
  rollingNumber($('#time'), clock.format(new Date()));
  syncModelActivity(state.modelActivity);
  renderServices();
  cards();
  drawWidget();
  syncOrganizer(state);
  syncAgenda(state);
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
    const value = $('[data-tile=system] .boardValue');
    if (value) value.textContent = cache.sys.ram + '% памяти';
    if (cache.openWidget === 'system') drawWidget();
  } catch {}
}
const val = (id) => $('#' + id)?.value || '';
function modal(title, html, layout) {
  const dialog = $('#modal');
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modalBody').scrollTop = 0;
  if (layout) dialog.dataset.layout = layout;
  else delete dialog.dataset.layout;
  if (!dialog.open) dialog.showModal();
}
function closeModal() {
  if ($('#modal').open) $('#modal').close();
}
async function send(input, voiceMode = false) {
  if (sending) return;
  let text = String(input || '').trim();
  const files = voiceMode ? [] : attachments;
  if (!text && !files.length) return;
  if (!text)
    text = files.some((f) => f.kind === 'image')
      ? 'Что на изображении?'
      : 'Расскажи, что в приложенных документах.';
  const cmd = parseCommand(text);
  if (!voiceMode && cmd?.key === 'screen' && !files.some((f) => f.kind === 'image')) {
    await addScreen();
    return;
  }
  if (cmd?.key === 'think' && files.length) {
    toast('Для /think убери вложения или отправь их отдельным сообщением.');
    return;
  }
  if (
    files.some((f) => f.kind === 'image') &&
    state.settings.provider === 'local' &&
    !state.models.find((m) => m.id === state.settings.model)?.visionInstalled
  ) {
    toast('Для отправки изображения скачай модуль выбранной модели в разделе «ИИ».');
    return;
  }
  closeSlash();
  nav('home');
  if (!voiceMode) {
    $('#prompt').value = '';
    clearAttachments();
  }
  sending = true;
  streamId = crypto.randomUUID();
  liveReply = '';
  renderChat();
  phase('thinking', state.settings.reduced);
  try {
    if (!current) current = await call('newChat');
    const r = await call('send', { id: current, text, voiceMode, attachments: files, requestId: streamId });
    current = r.id;
    return r.text;
  } finally {
    sending = false;
    streamId = null;
    liveReply = '';
    await refresh();
    phase(voice.enabled ? 'listening' : 'idle', state.settings.reduced);
  }
}
async function toggleVoice(standby = false, fromFooter = false) {
  if (voice.enabled && !standby) {
    sessionStorage.setItem('voiceMuted', '1');
    wakeGate.reset();
    clearTimeout(wakeTimer);
    if (fromFooter) {
      voice.stop(false, true);
      await call('stopRecognition');
    } else voice.stop();
    return;
  }
  wakeGate.reset();
  clearTimeout(wakeTimer);
  if (standby && voice.enabled) {
    voice.onStatus('Слушаю. Можно говорить.', 'listening');
    return;
  }
  sessionStorage.removeItem('voiceMuted');
  if (!fromFooter && !standby) nav('home');
  await voice.start(false, fromFooter);
}
function newChat() {
  if (sending) return;
  current = '';
  clearAttachments();
  closeSlash();
  $('#prompt').value = '';
  nav('home');
  $('#prompt').focus();
}
let modelListRequest = 0;
async function loadAIModels() {
  const base = state.settings.base;
  const request = ++modelListRequest;
  cache.aiModelStatus = 'Загружаю список моделей…';
  cache.availableAI = null;
  if (page === 'ai') renderPage();
  try {
    const ids = await call('discoverAi', { base });
    if (request !== modelListRequest || state.settings.base !== base) return;
    cache.availableAI = { base, ids };
    cache.aiModelStatus = ids.length ? '' : 'Сервис не вернул доступных моделей';
  } catch (error) {
    if (request !== modelListRequest || state.settings.base !== base) return;
    cache.aiModelStatus = error.message;
  }
  if (page === 'ai') renderPage();
}
async function saveSettings(data) {
  await call('settings', data);
  await refresh();
  if ('startListening' in data) {
    if (data.startListening) {
      sessionStorage.removeItem('voiceMuted');
      listenOnOpen();
    } else if (voice.enabled) await toggleVoice(false, true);
  }
}
function loadDraft(id) {
  const r = state.routines.find((r) => r.id === id);
  cache.commandTab = 'editor';
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
function drawWidgets() {
  const rows = cache.widgetDraft;
  modal(
    'Виджеты рабочего стола',
    rows
      .map(
        (w, i) =>
          '<div class="entry"><label><input type="checkbox" data-widget="' +
          esc(w.id) +
          '" ' +
          (w.visible ? 'checked' : '') +
          '>' +
          esc(state.widgetNames[w.id]) +
          '</label><span></span>' +
          (i ? btn('Выше', 'widgetUp', 'move-up', '', w.id) : '') +
          (i < rows.length - 1 ? btn('Ниже', 'widgetDown', 'move-down', '', w.id) : '') +
          '</div>',
      )
      .join('') +
      btn('Сохранить', 'saveWidgets', 'check', 'primary') +
      btn('Сбросить', 'resetWidgets', 'rotate-ccw'),
  );
}
async function moveBoardTile(from, to) {
  const visible = state.settings.widgets.filter((w) => w.visible);
  const a = visible.findIndex((w) => w.id === from),
    b = visible.findIndex((w) => w.id === to);
  if (a < 0 || b < 0 || a === b) return;
  visible.splice(b, 0, visible.splice(a, 1)[0]);
  let index = 0;
  await saveSettings({ widgets: state.settings.widgets.map((w) => (w.visible ? visible[index++] : w)) });
}
const boardContent = $('#content');
const sizingBoard = boardSizing(
  boardContent,
  async (id, size) => {
    await call('boardTile', { id, size });
    await refresh();
  },
  renderPage,
  err,
);
boardContent.addEventListener('dragstart', (e) => {
  const tile = e.target.closest('.boardTile[draggable=true]');
  if (tile) {
    e.dataTransfer.setData('application/x-mira-widget', tile.dataset.tile);
    e.dataTransfer.effectAllowed = 'move';
  }
});
boardContent.addEventListener('dragover', (e) => {
  if (
    cache.boardEditing &&
    e.target.closest('.boardTile') &&
    e.dataTransfer.types.includes('application/x-mira-widget')
  )
    e.preventDefault();
});
boardContent.addEventListener('drop', (e) => {
  const tile = e.target.closest('.boardTile'),
    from = e.dataTransfer.getData('application/x-mira-widget');
  if (cache.boardEditing && tile && from) {
    e.preventDefault();
    moveBoardTile(from, tile.dataset.tile).catch(err);
  }
});
async function finishQuickTask(cancel) {
  const draft = cache.quickTask;
  if (!draft) return;
  cache.quickTask = null;
  const text = draft.text.trim();
  if (!cancel && text) {
    try {
      await call('add', { ...draft, kind: 'tasks', text });
    } catch (e) {
      cache.quickTask = draft;
      renderPage();
      throw e;
    }
  }
  renderPage();
}
const toolsPanel = desktopTools(modal, () => state);
function listenOnOpen() {
  if (
    state.settings.introDone &&
    state.settings.startListening &&
    !voice.enabled &&
    !voice.testing &&
    !sessionStorage.getItem('voiceMuted')
  )
    toggleVoice(true, true).catch((error) => {
      if (['NotFoundError', 'NotAllowedError', 'NotReadableError'].includes(error.name)) {
        toast('Микрофон недоступен. Подключи его или разреши доступ в настройках системы.');
        return;
      }
      err(error);
    });
}
function launchSetup() {
  openSetup(
    state,
    async () => {
      await refresh();
      listenOnOpen();
    },
    () => startTour(nav, page),
  );
}
async function handle(action, id) {
  $('#boardMenu')?.hidePopover();
  if (action === 'add-reminders') return openAgenda('reminders', true);
  if (action?.startsWith('remove-')) {
    await call('remove', { kind: action.slice(7), id });
    return;
  }
  if (action === 'add-notes' || action === 'edit-notes')
    return openOrganizer('notes', id, action === 'add-notes');
  if (action === 'add-tasks' || action === 'edit-tasks') {
    if (page !== 'desk' || cache.openWidget) return openOrganizer('tasks', id, action === 'add-tasks');
    if (cache.quickTask) await finishQuickTask(false);
    cache.quickTask = {
      id,
      list: state.activeTaskList,
      text: state.tasks.find((t) => t.id === id)?.text || '',
    };
    renderPage();
    $('#quickTask')?.focus();
    return;
  }
  if (action === 'add-events') return openAgenda('events', true);
  if (action === 'edit-events') {
    const event = state.events.find((item) => item.id === id);
    return openAgenda(event?.category === 'reminder' ? 'reminders' : 'events', false, id);
  }
  switch (action) {
    case 'boardHide':
      await call('boardTile', { id, hide: true });
      return;
    case 'boardAdd':
    case 'widgets':
      cache.widgetDraft = structuredClone(state.settings.widgets);
      drawWidgets();
      return;
    case 'widgetUp':
    case 'widgetDown': {
      const rows = cache.widgetDraft,
        i = rows.findIndex((w) => w.id === id),
        j = i + (action === 'widgetUp' ? -1 : 1);
      if (i >= 0 && j >= 0 && j < rows.length) [rows[i], rows[j]] = [rows[j], rows[i]];
      drawWidgets();
      return;
    }
    case 'saveWidgets':
      await saveSettings({ widgets: cache.widgetDraft });
      closeModal();
      return;
    case 'resetWidgets':
      cache.widgetDraft = structuredClone(state.defaultWidgets);
      drawWidgets();
      return;
    case 'boardDone':
    case 'boardEdit':
      cache.boardEditing = !cache.boardEditing;
      renderPage();
      return;
    case 'boardUp':
    case 'boardDown': {
      const visible = state.settings.widgets.filter((w) => w.visible),
        i = visible.findIndex((w) => w.id === id);
      const next = visible[i + (action === 'boardUp' ? -1 : 1)];
      if (next) await moveBoardTile(id, next.id);
      return;
    }
    case 'day':
      $('#home').classList.remove('widgets-open');
      $('#panelWidgets').setAttribute('aria-expanded', 'false');
      if (id === 'mail') return openMail();
      if (id === 'notes' || id === 'tasks') return openOrganizer(id);
      if (id === 'events' || id === 'reminders') return openAgenda(id);
      cache.openWidget = id;
      if (id === 'system') cache.sys = await call('system');
      drawWidget();
      return;
    case 'dismissWidget':
      cache.openWidget = null;
      drawWidget();
      return;
    case 'assistants':
      return toolsPanel.assistants();
    case 'widgetShapes':
      return toolsPanel.shape();
    case 'cachePreview':
      return toolsPanel.scan();
    case 'tour':
      return startTour(nav, page);
    case 'gitBranches':
      return toolsPanel.git(state.activeProject);
    case 'setup':
      launchSetup();
      return;
    case 'context':
      modal(
        'Добавить контекст',
        '<div class="contextActions">' +
          btn('Прикрепить файл', 'pickContext', 'paperclip') +
          btn('Разговоры и проекты', 'chooseProject', 'history') + '</div>' +
          (state.notes.length
            ? '<h3 class="contextHeading">Заметки</h3><div class="contextActions">' +
              state.notes.slice(0, 8)
                .map((n) => btn(n.text.slice(0, 65), 'attachNote', 'notebook-pen', '', n.id)).join('') + '</div>'
            : ''),
        'context',
      );
      return;
    case 'chooseProject':
      closeModal();
      setHistory(true);
      return;
    case 'attachNote': {
      const note = state.notes.find((n) => n.id === id);
      if (note) {
        addAttachments([{ name: 'Заметка', text: note.text }]);
        closeModal();
        $('#prompt').focus();
      }
      return;
    }
    case 'chatModel':
      nav('ai');
      return;
    case 'commandPicker':
      modal(
        'Запустить команду',
        state.routines.map((r) => btn(r.name, 'launchFromChat', 'play', '', r.id)).join('') ||
          btn('Открыть редактор команд', 'commandEditor', 'workflow'),
      );
      return;
    case 'launchFromChat':
      closeModal();
      await call('run', { id });
      return;
    case 'commandEditor':
      cache.commandTab = 'editor';
      closeModal();
      nav('commands');
      return;
    case 'abilities':
      modal(
        'Что ты умеешь?',
        btn('Найти в интернете', 'searchNow', 'globe') +
          btn('Поставить таймер', 'focusCustom', 'timer') +
          btn('Добавить заметку', 'add-notes', 'notebook-pen') +
          btn('Создать задачу', 'add-tasks', 'list-checks') +
          btn('Прикрепить файл', 'pickContext', 'paperclip'),
      );
      return;
    case 'pickContext':
      closeModal();
      $('#attach').click();
      return;
    case 'saveWake':
      await saveSettings({ wakeAlias: val('wakeAlias') });
      return;
    case 'swapRates':
      await saveSettings({
        exchangeTo: state.settings.exchangeFrom,
        exchangeFrom: state.settings.exchangeTo,
      });
      return;
    case 'crypto':
      cache.crypto = await call('crypto');
      renderPage();
      drawWidget();
      return;
    case 'addProject':
    case 'editProject': {
      const p = action === 'editProject' && state.projects.find((x) => x.id === state.activeProject);
      modal(
        p ? 'Параметры проекта' : 'Новый проект',
        field('Название', 'projectName', p?.name || '') +
          '<label class="field">Инструкции для Миры<textarea id="projectRole" maxlength="4000">' +
          esc(p?.instructions || '') +
          '</textarea></label>' +
          btn('Сохранить', 'saveProject', 'check', 'primary', p?.id || ''),
      );
      return;
    }
    case 'projectEditor': {
      const p = state.projects.find((x) => x.id === state.activeProject);
      if (!p) return;
      const data = p.folder ? await call('projectFile', { op: 'list', id: p.id }) : { files: [] };
      modal(
        'Файлы · ' + p.name,
        btn(p.folder || 'Выбрать рабочую папку', 'projectFolder', 'folder-open') +
          (p.folder ? btn('Ветки Git', 'gitBranches', 'git-branch') : '') +
          (data.files.length
            ? select(
                'Открыть текстовый файл',
                'projectEntry',
                data.files.map((n) => [n, n]),
                '',
              )
            : '') +
          (data.files.length
            ? btn('Открыть', 'projectRead', 'file-text')
            : '<p>Здесь появятся текстовые файлы выбранной папки.</p>') +
          (data.truncated ? '<p>Показана часть файлов.</p>' : ''),
      );
      return;
    }
    case 'projectFolder':
      if (await call('projectFile', { op: 'folder', id: state.activeProject })) {
        await refresh();
        await handle('projectEditor');
      }
      return;
    case 'projectRead': {
      const name = val('projectEntry'),
        id = state.activeProject;
      cache.editing = { id, ...(await call('projectFile', { op: 'read', id, name })) };
      modal(
        name,
        '<textarea id="projectText" aria-label="Текст файла" spellcheck="false"></textarea>' +
          btn('Сохранить файл', 'projectWrite', 'check', 'primary') +
          btn('Добавить в чат', 'projectAttach', 'message-circle'),
      );
      $('#projectText').value = cache.editing.text;
      return;
    }
    case 'projectWrite': {
      const { id, name, revision } = cache.editing;
      const saved = await call('projectFile', {
        op: 'save',
        id,
        name,
        revision,
        text: $('#projectText').value,
      });
      cache.editing.revision = saved.revision;
      toast('Файл сохранён');
      return;
    }
    case 'projectAttach': {
      addAttachments([{ name: cache.editing.name, text: $('#projectText').value }]);
      closeModal();
      setHistory(false);
      nav('home');
      $('#prompt').focus();
      return;
    }
    case 'editTurn':
    case 'redoTurn': {
      if (sending) return;
      const chat = state.chats.find((c) => c.id === current),
        index = chat?.messages.findIndex((m) => m.id === id);
      if (index == null || index < 0) return;
      const editing = action === 'editTurn',
        last = chat.messages.at(-1).id;
      cache.revision = { id: current, target: id, last, editing };
      const later = index + (editing ? 2 : 1) < chat.messages.length;
      if (!editing && !later) return handle('applyRevision');
      modal(
        editing ? 'Изменить сообщение' : 'Ответить заново',
        (editing
          ? '<label class="field">Сообщение<textarea id="revisionText" rows="5">' +
            esc(chat.messages[index].text) +
            '</textarea></label>'
          : '') +
          (later ? '<p>Новый ответ заменит продолжение разговора с этого места.</p>' : '') +
          btn(editing ? 'Отправить изменение' : 'Заменить продолжение', 'applyRevision', 'arrow-up'),
      );
      if (editing) $('#revisionText').focus();
      return;
    }
    case 'applyRevision': {
      const draft = cache.revision;
      if (!draft || draft.id !== current || sending) return;
      const text = draft.editing ? val('revisionText') : undefined;
      if (draft.editing && !text.trim()) return;
      if ($('#modal').open) closeModal();
      cache.revision = null;
      sending = true;
      streamId = crypto.randomUUID();
      liveReply = '';
      renderChat();
      try {
        const answer = await call('reviseChat', { ...draft, text, requestId: streamId });
        if (voice.enabled) await voice.speak(answer);
      } finally {
        sending = false;
        streamId = null;
        liveReply = '';
        await refresh();
      }
      return;
    }
    case 'copyMessage':
      await call('messageCopy', { id: current, index: Number(id) });
      return;
    case 'noteMessage': {
      const m = state.chats.find((c) => c.id === current)?.messages[Number(id)];
      if (m) {
        await call('add', { kind: 'notes', text: m.text });
        toast('Ответ сохранён в заметки');
      }
      return;
    }
    case 'saveProject':
      await call('project', { id, name: val('projectName'), instructions: val('projectRole') });
      current = '';
      clearAttachments();
      closeSlash();
      $('#prompt').value = '';
      closeModal();
      await refresh();
      return;
    case 'delProject':
      await call('project', { id: state.activeProject, remove: true });
      current = '';
      await refresh();
      return;
    case 'reindex': {
      const d = await call('reindex');
      toast('В индексе файлов: ' + d.count);
      return;
    }
    case 'excludeDir':
      await call('excludeDir', { id });
      return;
    case 'screenshot':
      if (await call('screenshot')) toast('Снимок сохранён на полке');
      return;
    case 'addShortcut': {
      const options = [
        ...(await call('launchOptions')).map(([id, n]) => ['system:' + id, n]),
        ...state.routines.map((r) => ['routine:' + r.id, 'Команда · ' + r.name]),
        ...state.files.map((f) => ['file:' + f.id, 'Файл · ' + f.name]),
      ];
      modal(
        'Новый ярлык',
        select('Действие', 'launchTarget', options, '') +
          field('Название', 'launchName') +
          btn('Закрепить', 'saveShortcut', 'plus', 'primary'),
      );
      return;
    }
    case 'saveShortcut': {
      const [kind, target] = val('launchTarget').split(':');
      await call('shortcut', {
        kind,
        target,
        name: val('launchName') || $('#launchTarget').selectedOptions[0].textContent,
      });
      closeModal();
      return;
    }
    case 'dropShortcut':
      await call('shortcut', { id });
      return;
    case 'shortcutGo': {
      const r = state.shortcuts?.find((x) => x.id === id);
      if (r)
        await call({ routine: 'run', file: 'openFile', system: 'launchSystem' }[r.kind], { id: r.target });
      return;
    }
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
      cards();
      drawWidget();
      renderPage();
      return;
    case 'rates':
      cache.rates = await call('rates');
      cards();
      drawWidget();
      renderPage();
      return;
    case 'source':
      await call('url', { url: id });
      return;
    case 'viewChatImage':
      modal(
        'Изображение',
        '<img class="fullChatImage" src="/chat-images/' + esc(id) + '" alt="Изображение из разговора">',
      );
      return;
    case 'openChat':
      if (sending) return;
      if (current !== id) {
        clearAttachments();
        closeSlash();
        $('#prompt').value = '';
      }
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
          select(
            'Формат',
            'fileExt',
            [['', 'Все форматы'], ...['pdf', 'docx', 'txt', 'png', 'jpg', 'exe', 'lnk'].map((x) => [x, x])],
            '',
          ) +
          btn('Найти', 'findGo', 'search', 'primary') +
          '<div id="found"></div>',
      );
      return;
    case 'findGo': {
      const found = await call('find', { query: val('fileQ'), ext: val('fileExt') });
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
    case 'checkUpdate':
      if (cache.updateRunning) return;
      cache.updateStatus = 'Проверяю обновления…';
      cache.updateBuild = null;
      renderPage();
      try {
        cache.updateBuild = await call('checkUpdate');
        cache.updateStatus = cache.updateBuild
          ? 'Доступна версия ' + cache.updateBuild.version
          : 'Установлена последняя версия';
      } catch (error) {
        cache.updateStatus = error.message;
      }
      if (page === 'settings') renderPage();
      return;
    case 'installUpdate':
      if (cache.updateRunning ||
          !window.confirm('Скачать обновление и перезапустить Миру после подготовки?')) return;
      cache.updateRunning = true;
      cache.updateStatus = 'Скачиваю и проверяю обновление…';
      renderPage();
      try {
        await call('installUpdate');
      } catch (error) {
        cache.updateStatus = error.message;
        cache.updateRunning = false;
        if (page === 'settings') renderPage();
      }
      return;
    case 'buildVoiceRoutine':
      cache.commandTab = 'editor';
      nav('commands');
      loadDraft('');
      return;
    case 'youtubeRoutine':
      cache.draft = {
        name: 'Открыть YouTube',
        phrase: 'открой ютуб',
        hotkey: '',
        blocks: [
          { kind: 'browser', value: '' },
          { kind: 'url', value: 'https://www.youtube.com/' },
        ],
      };
      cache.node = 0;
      renderPage();
      return;
    case 'standby':
      await toggleVoice(true);
      return;
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
    case 'modelSection':
      cache.modelTab = id;
      renderPage();
      $('#content').scrollTop = 0;
      return;
    case 'modelPreview':
      cache.modelPreview = !cache.modelPreview;
      render();
      return;
    case 'playNayuClip':
    case 'playModelClip': {
      const clip = action === 'playNayuClip' ? val('nayuClip') : id;
      cache.gesture = clip;
      if (!cache.modelPreview && !state.overlay) {
        cache.modelPreview = true;
        render();
      }
      avatar()?.configureChoreography(clip);
      avatar()?.replayGesture();
      await call('motion', { id: clip });
      return;
    }
    case 'showAvatar':
      if ($('#navMenu').matches(':popover-open')) $('#navMenu').hidePopover();
      return saveSettings({ showAvatar: !state.settings.showAvatar });
    case 'seatTaskbar':
      await call('seat', { taskbar: true });
      return refresh();
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
      await call('motion', { id: 'dance', temporary: true });
      return;
    case 'replay':
      avatar()?.replayGesture();
      await call('motion', { id: cache.gesture });
      return;
    case 'settings':
      nav('settings');
      return;
    case 'testMic':
      if (voice.enabled) {
        toast('Микрофон уже включён в разговоре');
        return;
      }
      if (voice.testing) voice.stop(false);
      else await voice.start(true);
      await refreshAudioDevices();
      return;
    case 'audition':
      if (state.settings.ttsEnabled === false) return toast('Включи озвучку кнопкой «Голос» внизу.');
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
      const value = val(input);
      await call('key', { name, value });
      if (name === 'fish' && value && state.settings.fishPending) await saveSettings({ voice: 'fish' });
      toast('Настройка сохранена');
      return;
    }
    case 'installVoice':
      cache.voiceLoading = true;
      renderPage();
      try {
        await call('installVoice');
        toast('Ирина готова говорить');
      } finally {
        cache.voiceLoading = false;
        await refresh();
      }
      return;
    case 'pauseVoice':
      await call('cancelVoiceInstall');
      return;
    case 'saveSpeechService': {
      const key = val('speechKey');
      await saveSettings({
        speechService: {
          base: val('speechBase'),
          sttModel: val('sttModel'),
          ttsModel: val('ttsModel'),
          voice: val('apiVoice'),
        },
      });
      if (key) await call('key', { name: 'speechAPI', value: key });
      toast('Голосовой сервис сохранён');
      return;
    }
    case 'nativeGame':
      await call('nativeGame');
      return;
    case 'pickIrina':
      await call('installVoice');
      await refresh();
      return;
    case 'pluginOn':
    case 'pluginOff':
      await call('togglePlugin', { id, enabled: action === 'pluginOn' });
      await refresh();
      return;
    case 'panel':
      if (!(state.pluginIds || []).includes(id) || !['chess', 'shadow', 'freedoom'].includes(id)) return;
      modal(
        { chess: 'Шахматы', shadow: 'Театр теней', freedoom: 'Freedoom' }[id],
        '<iframe class="gamePanel" title="' + id + '" src="/panel.html?game=' + id + '"></iframe>',
      );
      return;
    case 'fishSaved':
    case 'fishResults':
      cache.fishTab = action === 'fishSaved' ? 'saved' : 'search';
      renderPage();
      return;
    case 'fishStar':
      await call('fishFavorite', { ...cache.fishList?.find((v) => v.id === id), id });
      await refresh();
      return;
    case 'fishPreview': {
      if (!cache.previewId && (voice.busy || voice.playing)) {
        toast('Сначала дождись окончания реплики');
        return;
      }
      const stopping = cache.previewId === id,
        version = (cache.previewVersion || 0) + 1;
      cache.previewVersion = version;
      voice.hush();
      cache.previewId = stopping ? '' : id;
      renderPage();
      if (stopping) {
        voice.onStatus(voice.enabled ? 'Слушаю. Можно говорить.' : '', voice.enabled ? 'listening' : 'idle');
        return;
      }
      try {
        await voice.speak('', id);
      } finally {
        if (version === cache.previewVersion) {
          cache.previewId = '';
          if (page === 'voice') renderPage();
        }
      }
      return;
    }
    case 'fishSearch':
    case 'fishNext':
    case 'fishPrev': {
      const query = action === 'fishSearch' ? val('fishQuery').trim() : cache.fishQuery || '';
      const number =
        action === 'fishNext' ? cache.fishPage + 1 : action === 'fishPrev' ? cache.fishPage - 1 : 1;
      const serial = (cache.fishRequest || 0) + 1;
      cache.fishRequest = serial;
      cache.fishLoading = true;
      cache.fishError = '';
      cache.fishTab = 'search';
      cache.fishInput = query;
      renderPage();
      try {
        const result = await call('fish', { query, page: number });
        if (cache.fishRequest === serial) {
          cache.fishQuery = query;
          cache.fishPage = number;
          cache.fishList = result.items;
          cache.fishMore = result.more;
        }
      } catch (e) {
        if (cache.fishRequest === serial) {
          cache.fishError = recordError(
            'Не удалось открыть библиотеку Fish Audio. Проверь подключение и повтори поиск.',
          );
          cache.fishList = [];
          cache.fishPage = 1;
          cache.fishMore = false;
        }
      } finally {
        if (cache.fishRequest === serial) {
          cache.fishLoading = false;
          if (page === 'voice') renderPage();
        }
      }
      return;
    }
    case 'fishPick': {
      const model = [...(cache.fishList || []), ...(state.fishFavorites || [])].find((v) => v.id === id);
      if (!model) return;
      const ready = state.keys.includes('fish');
      await saveSettings({
        fishVoice: id,
        fishVoiceName: model.title,
        fishPending: !ready,
        ...(ready ? { voice: 'fish' } : {}),
      });
      toast(ready ? 'Голос ответов изменён' : 'Голос выбран. Для озвучки ответов добавь ключ Fish Audio.');
      return;
    }
    case 'forgetAI':
      if (!window.confirm('Удалить ключ для ' + id + '?')) return;
      await call('key', { name: 'ai', base: id, value: '' });
      cache.availableAI = null;
      return refresh();
    case 'useSavedAI':
      await saveSettings({ base: id, cloudModel: '', provider: 'endpoint' });
      return loadAIModels();
    case 'listAI':
    case 'saveAI': {
      const base = val('base'),
        cloudModel = val('cloudModel'),
        key = val('aiKey');
      await saveSettings({ base, cloudModel, provider: 'endpoint' });
      if (key) {
        await call('key', { name: 'ai', base, value: key });
        await refresh();
      }
      if (action === 'saveAI') toast('Подключение сохранено');
      return loadAIModels();
    }
    case 'saveRole':
      return saveSettings({ role: val('role') });
    case 'searchNow':
      closeModal();
      nav('home');
      $('#prompt').value = 'Найди в интернете ';
      $('#prompt').focus();
      return;
    case 'removeVision':
      await call('removeModel', { id, vision: true });
      return refresh();
    case 'downloadVision':
      await call('download', { id, vision: true });
      return refresh();
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
    case 'commandTab':
      pages.captureDraft(cache.draft);
      cache.commandTab = id;
      renderPage();
      $('#content').scrollTop = 0;
      return;
    case 'groupRoutine':
      loadDraft('');
      cache.draft.group = id;
      renderPage();
      return;
    case 'newCommandGroup':
      modal(
        'Новая папка',
        field('Название', 'commandGroup', '') + btn('Создать папку', 'saveCommandGroup', 'plus'),
      );
      return;
    case 'saveCommandGroup':
      await call('createCommandGroup', { name: val('commandGroup') });
      closeModal();
      await refresh();
      return;
    case 'saveRoutineLimits': {
      const limits = {};
      for (const key of ['routineSeconds', 'routineSteps', 'routineRepeats']) limits[key] = Number(val(key));
      await saveSettings(limits);
      toast('Пределы сохранены');
      return;
    }
    case 'scanCommandApps': {
      const items = await call('scanCommandApps');
      modal(
        'Приложения из меню «Пуск»',
        items.length
          ? '<div class="appChoices">' +
              items
                .map(
                  (v) =>
                    '<div><label><input type="checkbox" data-app-id="' +
                    esc(v.id) +
                    '" checked> ' +
                    esc(v.name) +
                    '</label><input type="text" aria-label="Фраза запуска: ' +
                    esc(v.name) +
                    '" maxlength="160" data-app-phrase="' +
                    esc(v.id) +
                    '" value="' +
                    esc('открой ' + v.name) +
                    '"></div>',
                )
                .join('') +
              '</div>' +
              (state.models.some((m) => m.id === state.settings.model && m.installed)
                ? btn('Подобрать фразы локальной моделью', 'suggestAppPhrases', 'sparkles')
                : '') +
              btn('Создать команды', 'addAppCommands', 'check')
          : '<p>Ярлыки приложений не найдены. Поиск использует меню «Пуск» на компьютере с Windows.</p>',
      );
      return;
    }
    case 'suggestAppPhrases': {
      const panel = $('.appChoices');
      const inputs = new Map(
        [...panel.querySelectorAll('[data-app-phrase]')].map((el) => [el.dataset.appPhrase, [el, el.value]]),
      );
      const ids = [...panel.querySelectorAll('[data-app-id]:checked')].map((el) => el.dataset.appId);
      const b = $('[data-act=suggestAppPhrases]');
      b.disabled = true;
      try {
        const suggested = await call('suggestAppPhrases', { ids });
        if (!panel.isConnected) return;
        for (const [key, phrase] of Object.entries(suggested)) {
          const [el, old] = inputs.get(key);
          if (el.value === old) el.value = phrase;
        }
      } finally {
        b.disabled = false;
      }
      return;
    }
    case 'addAppCommands': {
      const ids = [...document.querySelectorAll('[data-app-id]:checked')].map((x) => x.dataset.appId);
      const phrases = Object.fromEntries(
        [...document.querySelectorAll('[data-app-phrase]')].map((el) => [el.dataset.appPhrase, el.value]),
      );
      const n = await call('addAppCommands', { ids, phrases });
      closeModal();
      await refresh();
      toast('Добавлено команд: ' + n);
      return;
    }
    case 'addBaseCommands': {
      const n = await call('addBaseCommands');
      await refresh();
      toast('Добавлено команд: ' + n);
      return;
    }
    case 'describeCommand':
      modal(
        'Команда из описания',
        field('Название и действия', 'commandPrompt', '') +
          '<p class="muted">Например, «Утро: поставь таймер на 25 минут и запиши планы».</p>' +
          btn('Составить', 'generateCommand', 'workflow', 'primary'),
      );
      return;
    case 'generateCommand': {
      const draft = await call('draftCommand', { text: val('commandPrompt') });
      closeModal();
      cache.draft = draft;
      cache.node = 0;
      renderPage();
      return;
    }
    case 'openDraft': {
      const item = state.chats.find((c) => c.id === current)?.messages[+id]?.draft;
      if (item) {
        cache.commandTab = 'editor';
        nav('commands');
        cache.draft = structuredClone(item);
        cache.node = 0;
        renderPage();
      }
      return;
    }
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
      if (kind.startsWith('snippet:')) {
        const r = state.routines.find((r) => r.id === kind.slice(8));
        if (!r) throw Error('Команда набора удалена');
        const offset = cache.draft.blocks.length;
        if (offset + r.blocks.length > 64) throw Error('Допустимо до 64 блоков');
        for (const [i, b] of r.blocks.entries()) {
          cache.draft.blocks.push({
            kind: b.kind,
            value: b.value,
            next: offset + (b.next ?? i + 1),
            alternate: offset + (b.alternate ?? i + 1),
          });
        }
        cache.node = offset;
        renderPage();
        return;
      }
      const fallback =
        {
          wait: '2',
          focus: '25',
          repeat: '2',
          ifTime: '09-18',
          processRunning: 'notepad.exe',
          closeWindow: 'notepad.exe',
          shutdownTimer: '30',
          quiet: 'on',
          clipboardAI: 'Переведи текст на русский',
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
    case 'extensionPanel': {
      const pkg = state.extensions.find((x) => x.id === id);
      if (!pkg) return;
      const c = pkg.contributions;
      const commands = (c.panel?.commands || [])
        .map((i) => state.routines.find((r) => r.id === pkg.routines[i]))
        .filter(Boolean);
      modal(
        c.panel?.name || pkg.name,
        '<p>' +
          esc(c.panel?.body || '') +
          '</p>' +
          commands.map((r) => btn(r.name, 'extensionRun', 'play', '', r.id)).join('') +
          (c.triggers
            ? '<p>' +
              c.triggers
                .map(
                  (t) =>
                    esc(pages.triggerNames[t.event]) +
                    ' → ' +
                    esc(state.routines.find((r) => r.id === pkg.routines[t.command])?.name),
                )
                .join('<br>') +
              '</p>' +
              btn(
                pkg.triggersEnabled ? 'Остановить триггеры' : 'Включить триггеры',
                'extensionTriggers',
                'clock-3',
                '',
                id,
              )
            : '') +
          btn('Экспорт набора', 'exportPack', 'download', '', id) +
          (c.theme ? btn('Применить тему', 'extensionTheme', 'palette', '', id) : '') +
          (c.ai ? btn('ИИ · ' + new URL(c.ai.base).host, 'extensionAI', 'brain-circuit', '', id) : '') +
          (c.speech ? btn('Голос · ' + new URL(c.speech.base).host, 'extensionSpeech', 'mic', '', id) : '') +
          (c.tools || [])
            .map((t, i) =>
              btn(
                'Подключить ' + t.name + ' · ' + new URL(t.url).host,
                'extensionTool',
                'cable',
                '',
                id + '@' + i,
              ),
            )
            .join(''),
      );
      return;
    }
    case 'exportPack':
      await call('exportPack', { id });
      return;
    case 'extensionTriggers':
      await call('packTriggers', {
        id,
        enabled: !state.extensions.find((p) => p.id === id).triggersEnabled,
      });
      await refresh();
      return handle('extensionPanel', id);
    case 'extensionRun':
      toast(await call('run', { id }));
      return;
    case 'extensionTheme':
      await saveSettings(state.extensions.find((x) => x.id === id).contributions.theme);
      return;
    case 'extensionAI': {
      const ai = state.extensions.find((x) => x.id === id).contributions.ai;
      await saveSettings({ provider: 'endpoint', base: ai.base, cloudModel: ai.model });
      closeModal();
      nav('ai');
      return;
    }
    case 'extensionSpeech': {
      const v = state.extensions.find((x) => x.id === id).contributions.speech;
      await saveSettings({
        speechService: v,
        stt: v.sttModel ? 'speechAPI' : 'local',
        voice: v.ttsModel ? 'speechAPI' : 'builtin',
      });
      closeModal();
      nav('voice');
      return;
    }
    case 'extensionTool': {
      const index = id.lastIndexOf('@'),
        pkg = state.extensions.find((x) => x.id === id.slice(0, index));
      const t = pkg?.contributions.tools[+id.slice(index + 1)];
      if (t && !state.tools.some((x) => x.url === t.url)) {
        await call('addMCP', t);
        toast('Сервер подключён');
      }
      return;
    }
    case 'pack':
      await call('pack', { id });
      toast('Набор добавлен в команды');
      return;
    case 'removePack':
      await call('removePack', { id });
      return;
    case 'importPack':
      if (await call('importPack')) toast('Набор установлен');
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
    case 'workConnect':
      await call('workshopConnect', { repo: val('workRepo'), token: val('workToken') });
      cache.workRows = null;
      await refresh();
      return;
    case 'workBrowse':
      cache.workRows = await call('workshopList');
      renderPage();
      if (!cache.workRows.length) toast('В каталоге пока нет работ');
      return;
    case 'workInspect': {
      const pack = await call('workshopInspect', { key: id });
      cache.workPreview = { key: id, sha: pack.sha };
      modal(
        pack.name,
        '<p>' +
          esc(pack.detail) +
          '</p><ul>' +
          pack.routines
            .map((r) => '<li>' + esc(r.name) + ' · ' + r.blocks.length + ' действий</li>')
            .join('') +
          '</ul><details><summary>Действия и расширения</summary><pre>' +
          esc(JSON.stringify({ routines: pack.routines, contributions: pack.contributions }, null, 2)) +
          '</pre></details>' +
          btn('Установить набор', 'workInstall', 'plus', 'primary'),
      );
      return;
    }
    case 'workInstall':
      await call('workshopInstall', cache.workPreview);
      closeModal();
      await refresh();
      return;
    case 'workPrepare': {
      const spec = await call('workDraft', { id: val('workChoice') });
      const ref = state.published?.[state.workshopRepo + '#' + spec.id],
        existing = ref ? await call('workshopInspect', { key: ref.key }) : null;
      cache.workSha = existing?.sha;
      modal(
        'Публикация в ' + state.workshopRepo,
        '<h3>' +
          esc(spec.name) +
          '</h3><pre>' +
          esc(JSON.stringify({ routines: spec.routines, contributions: spec.contributions }, null, 2)) +
          '</pre>' +
          (existing
            ? '<details><summary>Опубликованная версия</summary><pre>' +
              esc(
                JSON.stringify(
                  { routines: existing.routines, contributions: existing.contributions },
                  null,
                  2,
                ),
              ) +
              '</pre></details>'
            : '') +
          field('Описание', 'workDetail', existing?.detail || '') +
          btn('Опубликовать', 'workPublish', 'upload', 'primary', spec.id),
      );
      return;
    }
    case 'workPublish':
      await call('workshopPublish', { id, detail: val('workDetail'), sha: cache.workSha });
      closeModal();
      cache.workRows = await call('workshopList');
      await refresh();
      return;
    case 'workRemove': {
      const ref = state.published?.[state.workshopRepo + '#' + id],
        current = await call('workshopInspect', { key: ref.key });
      cache.workSha = current.sha;
      modal('Снять с публикации «' + current.name + '»?', btn('Снять', 'workUnpublish', 'x', 'primary', id));
      return;
    }
    case 'workUnpublish':
      await call('workshopUnpublish', { id, sha: cache.workSha });
      closeModal();
      cache.workRows = await call('workshopList');
      await refresh();
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
    const next = b.dataset.go;
    if (next === page && !document.documentElement.dataset.surfaceMotion) nav(next);
    else {
      const homeSwitch = [page, next].sort().join('/') === 'desk/home';
      changeSurface(homeSwitch ? (next === 'desk' ? 'desk' : 'chat') : 'page', () => nav(next));
    }
    return;
  }
  if (b.dataset.dismiss === 'modal') {
    closeModal();
    return;
  }
  if (b.dataset.dismiss === 'drawer') {
    setHistory(false);
    $('#historyBtn').focus();
    return;
  }
  if (b.dataset.win) {
    call('window', { action: b.dataset.win }).catch(err);
    return;
  }
  if (b.dataset.act) {
    const loading = ['weather', 'rates', 'refreshSystem', 'scanCommandApps', 'searchNow', 'find'].includes(
      b.dataset.act,
    );
    if (loading) b.setAttribute('aria-busy', 'true');
    handle(b.dataset.act, b.dataset.id)
      .catch(err)
      .finally(() => {
        if (loading) b.removeAttribute('aria-busy');
      });
  }
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.widget) {
    cache.widgetDraft.find((w) => w.id === e.target.dataset.widget).visible = e.target.checked;
    return;
  }
  const v = e.target.value;
  if (e.target.id === 'microphoneId' || e.target.id === 'speakerId') {
    const key = e.target.id;
    (async () => {
      if (key === 'microphoneId') await voice.switchInput(v);
      else await voice.route(v);
      await saveSettings({ [key]: v });
    })().catch((error) => {
      renderPage();
      err(error);
    });
    return;
  }
  if (e.target.id.startsWith('place-')) {
    call('screenWidget', { id: e.target.id.slice(6), mode: v }).catch(err);
    return;
  }
  if (e.target.id === 'chatProject') {
    if (sending) {
      renderChat();
      return;
    }
    clearAttachments();
    closeSlash();
    $('#prompt').value = '';
    current = '';
    call('project', { id: v }).then(refresh).catch(err);
    return;
  }
  if (e.target.id === 'voicePick' && v === 'fish' && !(state.keys.includes('fish') && state.settings.fishVoice)) {
    e.target.value = state.settings.voice;
    $('#fishQuery').focus();
    $('#fishQuery').scrollIntoView({ block: 'nearest' });
    return;
  }
  const settings = {
    customColor: { customColor: v },
    accent: { accent: v },
    glow: { glow: +v },
    glass: { glass: v === 'on' },
    graphLines: { graphLines: v },
    allowTypos: { allowTypos: v === 'on' },
    phraseThreshold: { phraseThreshold: Number(v) },
    avatarPick: { avatar: v },
    overlayHeight: { overlayHeight: +v },
    overlayAnchor: { overlayAnchor: v },
    outfit: { outfit: v },
    searchFallback: { searchFallback: v === 'on' },
    voicePick: { voice: v },
    sysVoice: { systemVoice: v },
    stt: { stt: v },
    quiet: { quiet: v === 'on' },
    interruptReplies: { interruptReplies: v === 'on' },
    ...Object.fromEntries(
      [
        'island',
        'islandPin',
        'hideCapture',
        'startHidden',
        'startLogin',
        'startListening',
        'bubbles',
        'disableBlur',
        'windowButtonBackground',
        'minimizeToTray',
      ].map((k) => [k, { [k]: v === 'on' }]),
    ),
    ...Object.fromEntries(
      ['speechRate', 'speechVolume', 'sensitivity', 'silence'].map((k) => [k, { [k]: Number(v) }]),
    ),
    ...Object.fromEntries(
      ['degree', 'exchangeFrom', 'exchangeTo', 'cryptoCoin', 'currency'].map((k) => [k, { [k]: v }]),
    ),
    theme: { theme: v },
    fps: { fps: +v },
    reduced: { reduced: v === 'on' },
    provider: { provider: v },
  }[e.target.id];
  if (settings) {
    saveSettings(settings).catch(err);
    return;
  }
  if (e.target.id === 'uiLanguage' && v !== state.settings.language) {
    call('settings', { language: v })
      .then(() => location.reload())
      .catch(err);
    return;
  }
  if (e.target.id === 'availableAI' && v) {
    $('#cloudModel').value = v;
    saveSettings({ cloudModel: v }).catch(err);
  }
  if (e.target.id === 'preset' && v) {
    $('#base').value = v;
    const preset = pages.providerPresets.find((p) => p[0] === v);
    $('#cloudModel').value = preset?.[2] || '';
  }
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
  if (e.key === 'Escape' && e.target.id === 'prefsQuery' && e.target.value) {
    e.preventDefault();
    e.stopPropagation();
    e.target.value = '';
    e.target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (e.key === 'Enter' && ['aiKey', 'cloudModel', 'base'].includes(e.target.id)) {
    e.preventDefault();
    handle('saveAI').catch(err);
    return;
  }
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
const promptField = $('#prompt'),
  slashMenu = $('#slashMenu');
let slashRows = [],
  slashIndex = 0;
function clearAttachments() {
  draftEpoch++;
  attachments = [];
  drawAttachments();
}
function drawAttachments() {
  const el = $('#attachment');
  const previous = new Set([...el.children].map((chip) => chip.dataset.motionId));
  el.hidden = !attachments.length;
  el.innerHTML = attachments
    .map(
      (f, i) =>
        '<span data-motion-id="' +
        esc(f.id || f.name) +
        '">' +
        (f.kind === 'image' ? '<img src="' + esc(f.data) + '" alt="">' : ico('file-text')) +
        esc(f.name) +
        '<button type="button" data-remove="' +
        i +
        '" aria-label="Убрать ' +
        esc(f.name) +
        '">' +
        ico('x') +
        '</button></span>',
    )
    .join('');
  for (const chip of el.children)
    if (!previous.has(chip.dataset.motionId))
      appear(chip, { opacity: 0, scale: '.94', translate: '0 4px' }, 200);
}
function addAttachments(items) {
  const all = [...attachments, ...items];
  if (all.length > 8 || all.filter((x) => x.kind === 'image').length > 4)
    throw Error('Можно добавить восемь вложений, из них до четырёх изображений');
  if (all.reduce((n, f) => n + (f.text?.length || 0), 0) > 45000)
    throw Error('В приложенных документах больше 45 000 знаков');
  attachments = all;
  drawAttachments();
}
async function addScreen() {
  const epoch = draftEpoch,
    shot = await call('chatScreen');
  if (epoch !== draftEpoch) return;
  addAttachments([shot]);
  promptField.focus();
}
function closeSlash() {
  slashMenu.hidden = true;
  $('#slash').setAttribute('aria-expanded', 'false');
  promptField.removeAttribute('aria-activedescendant');
}
function showSlash(fromButton = false) {
  const value = fromButton && !/^\/[a-z]*$/i.test(promptField.value) ? '/' : promptField.value;
  if (!/^\/[a-z]*$/i.test(value)) {
    closeSlash();
    return;
  }
  slashRows = commands.filter(([id]) => ('/' + id).startsWith(value.toLowerCase()));
  if (!slashRows.length) {
    closeSlash();
    return;
  }
  slashIndex = Math.min(slashIndex, slashRows.length - 1);
  slashMenu.hidden = false;
  $('#slash').setAttribute('aria-expanded', 'true');
  slashMenu.innerHTML = slashRows
    .map(
      ([key, label], i) =>
        '<button type="button" role="option" id="slashOption' +
        i +
        '" aria-selected="' +
        (i === slashIndex) +
        '" data-key="' +
        key +
        '"><strong>/' +
        key +
        '</strong> ' +
        esc(label) +
        '</button>',
    )
    .join('');
  promptField.setAttribute('aria-activedescendant', 'slashOption' + slashIndex);
  slashMenu.children[slashIndex].scrollIntoView({ block: 'nearest' });
}
async function chooseSlash(key) {
  const before = promptField.value;
  closeSlash();
  promptField.value = '/' + key + ' ' + (/^\/[a-z]*$/i.test(before) ? '' : before);
  promptField.focus();
  if (key === 'screen') await addScreen();
  if (key === 'think') toast('Уровни: auto, off, low, medium, high');
}
$('#slash').onclick = () => {
  if (!slashMenu.hidden) {
    closeSlash();
    return;
  }
  if (!promptField.value) promptField.value = '/';
  slashIndex = 0;
  promptField.focus();
  showSlash(true);
};
slashMenu.onclick = (e) => {
  const button = e.target.closest('[data-key]');
  if (button) chooseSlash(button.dataset.key).catch(err);
};
promptField.oninput = () => {
  slashIndex = 0;
  showSlash();
};
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#slashMenu,#slash,#prompt')) closeSlash();
});
promptField.onkeydown = (e) => {
  if (e.isComposing) return;
  if (!slashMenu.hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSlash();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      slashIndex = (slashIndex + (e.key === 'ArrowDown' ? 1 : -1) + slashRows.length) % slashRows.length;
      const row = slashMenu.children[slashIndex];
      for (const b of slashMenu.children) b.setAttribute('aria-selected', String(b === row));
      promptField.setAttribute('aria-activedescendant', row.id);
      row.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      slashMenu.children[slashIndex].click();
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#messageForm').requestSubmit();
  }
};
$('#attach').onclick = async () => {
  const epoch = draftEpoch;
  try {
    const files = await call('chatFiles');
    if (!files.length) return;
    const { readAttachment } = await import('./documents.js');
    const added = [];
    for (const file of files) added.push(file.kind === 'image' ? file : await readAttachment(file));
    if (epoch === draftEpoch) addAttachments(added);
  } catch (e) {
    err(e);
  }
};
async function attachFromBrowser(files) {
  const epoch = draftEpoch;
  if (files.length + attachments.length > 8) throw Error('Можно добавить до восьми файлов');
  const { readDropped } = await import('./documents.js'),
    added = [];
  for (const file of files) added.push(await readDropped(file));
  if (epoch === draftEpoch) addAttachments(added);
}
promptField.addEventListener('paste', (e) => {
  const files = Array.from(e.clipboardData?.files || []);
  if (!files.length) return;
  e.preventDefault();
  attachFromBrowser(files).catch(err);
});
const composer = $('#compose');
composer.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('Files')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    composer.classList.add('dropping');
  }
});
composer.addEventListener('dragleave', (e) => {
  if (!composer.contains(e.relatedTarget)) composer.classList.remove('dropping');
});
composer.addEventListener('drop', (e) => {
  composer.classList.remove('dropping');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) {
    e.preventDefault();
    attachFromBrowser(files).catch(err);
  }
});
$('#attachment').onclick = (e) => {
  const b = e.target.closest('[data-remove]');
  if (b) {
    attachments.splice(Number(b.dataset.remove), 1);
    drawAttachments();
  }
};
$('#serviceMic').onclick = () => toggleVoice(false, true).catch(err);
$('#composerVoice').onclick = $('#serviceVoice').onclick = async () => {
  const button = $('#serviceVoice');
  $('#composerVoice').disabled = button.disabled = true;
  try {
    const enabled = state.settings.ttsEnabled === false;
    state.settings.ttsEnabled = enabled;
    if (!enabled && voice.playing) voice.silence();
    renderServices();
    await saveSettings({ ttsEnabled: enabled });
  } catch (e) {
    await refresh();
    err(e);
  } finally {
    $('#composerVoice').disabled = button.disabled = false;
  }
};
$('#mic').onclick = $('#voiceStart').onclick = () => toggleVoice().catch(err);
$('#voiceEnd').onclick = () => {
  sessionStorage.setItem('voiceMuted', '1');
  wakeGate.reset();
  clearTimeout(wakeTimer);
  voice.stop();
};
$('#composeOptions').onclick = () => {
  const panel = $('#chatOptions');
  panel.hidden = !panel.hidden;
  $('#composeOptions').setAttribute('aria-expanded', String(!panel.hidden));
};
$('#recentChat').onclick = async () => {
  const chat = state.chats
    .filter((c) => c.messages.length)
    .sort((a, b) => b.messages.at(-1).time - a.messages.at(-1).time)[0];
  if (!chat) return;
  try {
    await call('project', { id: chat.project || '' });
    await refresh();
    await handle('openChat', chat.id);
  } catch (e) {
    err(e);
  }
};
$('#panelWidgets').onclick = () => {
  if (page === 'desk') {
    const menu = $('#boardMenu');
    if (menu) {
      menu.togglePopover();
      $('#panelWidgets').setAttribute('aria-expanded', String(menu.matches(':popover-open')));
    }
    return;
  }
  if (page !== 'home') nav('home');
  const visible = $('#home').classList.toggle('widgets-open');
  $('#panelWidgets').setAttribute('aria-expanded', String(visible));
};
$('#topOverlay').onclick = () => {
  $('#navMenu').hidePopover();
  handle('overlay').catch(err);
};
$('#dance').onclick = () => handle('dance').catch(err);
function setHistory(open) {
  $('#drawer').hidden = !open;
  $('#historyBtn').setAttribute('aria-expanded', String(open));
}
$('#historyBtn').onclick = () => setHistory($('#drawer').hidden);
$('#drawerNewChat').onclick = newChat;
$('#newChat').onclick = newChat;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#drawer').hidden && !document.querySelector('dialog[open]')) {
      setHistory(false);
      $('#historyBtn').focus();
      return;
    }
    $('#home').classList.remove('widgets-open');
    $('#panelWidgets').setAttribute('aria-expanded', 'false');
    cache.openWidget = null;
    drawWidget();
  }
});
window.desk.on(async (e) => {
  if (e.type === 'assistantJobs') {
    if ($('#jobList')) await toolsPanel.jobs();
    return;
  }
  if (e.type === 'modelActivity') {
    syncModelActivity(e);
    renderServices();
    return;
  }
  if (e.type === 'chatText') {
    if (!sending || e.requestId !== streamId || e.chatId !== current) return;
    const scroller = $('#messages'),
      el = $('#liveReply');
    const prior = liveReply;
    liveReply = e.text;
    if (el) {
      const bottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
      el.className = 'bubble assistant';
      streamText(el, prior, liveReply);
      if (bottom) scroller.scrollTop = scroller.scrollHeight;
    }
    return;
  }
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
      if (e.error) err(e.message);
      else toast(e.message);
      return;
    }
    if (e.type === 'standby') {
      await toggleVoice(true);
      return;
    }
    if (e.type === 'openWidget') {
      nav('home');
      await handle('day', e.id);
      return;
    }
    if (e.type === 'islandChat') {
      nav('home');
      if (e.id) {
        current = e.id;
        await call('project', { id: state.chats.find((c) => c.id === current)?.project || '' });
      }
      if (e.text) await send(e.text);
      else renderChat();
      return;
    }
    if (e.type === 'toggleVoice') {
      await toggleVoice();
      return;
    }
    if (e.type === 'stopAudio') {
      voice.silence();
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
      ? 'Отрисовка · ' + Math.round(stats.fps) + ' кадр/с · 95% кадров до ' + Math.round(stats.p95ms) + ' мс'
      : '';

  const now = new Date();
  rollingNumber($('#time'), clock.format(now));
  document.querySelectorAll('[data-wall-time]').forEach((el) => rollingNumber(el, clock.format(now)));
  for (const el of document.querySelectorAll('[data-wall-date]')) {
    if (el.dataset.wallDate !== now.toDateString()) {
      el.dataset.wallDate = now.toDateString();
      el.innerHTML = pages.wallCalendar(now);
    }
  }
  document.querySelectorAll('[data-clock]').forEach((el) => rollingNumber(el, timerTime(state.focus)));
}, 1000);
setInterval(() => {
  if (page === 'desk' && !document.hidden) refreshSystem();
}, 6500);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state?.settings.theme === 'system') render();
});
$('#modal').addEventListener('close', () => {
  $('#modalBody').replaceChildren();
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
  if (!state.settings.introDone || sessionStorage.getItem('reopenIntro')) {
    sessionStorage.removeItem('reopenIntro');
    launchSetup();
  } else listenOnOpen();
}
boot().catch(err);

function filterCommandList() {
  const query = (cache.commandQuery || '').trim().toLocaleLowerCase('ru');
  const routines = new Map(state.routines.map((r) => [r.id, r]));
  let count = 0;
  for (const group of document.querySelectorAll('[data-command-group]')) {
    let visible = !query || group.dataset.commandGroup.toLocaleLowerCase('ru').includes(query);
    for (const row of group.querySelectorAll('[data-act=edit]')) {
      const r = routines.get(row.dataset.id);
      row.hidden =
        !!query && ![r.name, r.group, r.phrase].some((v) => v?.toLocaleLowerCase('ru').includes(query));
      if (!row.hidden) {
        visible = true;
        count++;
      }
    }
    group.hidden = !visible;
  }
  const empty = $('#noCommandMatches');
  if (empty) empty.hidden = !query || count > 0;
}
$('#historyQuery').oninput = renderChat;
document.addEventListener('submit', (e) => {
  if (e.target.id === 'fishSearchForm') {
    clearTimeout(voiceSearchTimer);
    e.preventDefault();
    handle('fishSearch').catch(err);
  }
});
let voiceSearchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'fishQuery') {
    cache.fishInput = e.target.value;
    clearTimeout(voiceSearchTimer);
    cache.fishRequest = (cache.fishRequest || 0) + 1;
    cache.fishLoading = false;
    if (cache.fishInput.trim().length >= 2)
      voiceSearchTimer = setTimeout(() => {
        if (page === 'voice' && $('#fishQuery')) handle('fishSearch').catch(err);
      }, 420);
  }
  if (e.target.id === 'commandQuery') {
    cache.commandQuery = e.target.value;
    filterCommandList();
  }
  if (e.target.id === 'prefsQuery') {
    cache.preferencesQuery = e.target.value;
    filterPreferences();
    pageContent.scrollTop = 0;
    sections();
  }
});
