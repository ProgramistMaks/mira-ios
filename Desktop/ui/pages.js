import { themeList, defaultCustomColor } from './themes.mjs';
export { themeList };
import { backgroundControls } from './backgrounds.js';
import { $, esc, ico, opt, btn, box, field, select, timerTime, timeLabel } from './shared.js';
import { occursOn } from './calendar-dates.mjs';
import { sortedNotes, noteLabel, taskListOf } from './note-format.mjs';
export const names = {
  home: 'Главная',
  desk: 'Рабочий стол',
  commands: 'Команды',
  model: 'Модель',
  voice: 'Голос',
  ai: 'ИИ',
  plugins: 'Мастерская',
  settings: 'Настройки',
};
export const tabIcons = {
  home: 'house',
  commands: 'workflow',
  model: 'user-round',
  voice: 'audio-lines',
  ai: 'brain-circuit',
  plugins: 'blocks',
  settings: 'sliders-horizontal',
};
const empty = (s) => '<p class="empty">' + esc(s) + '</p>';
const acts = (...a) => '<div class="actions">' + a.join('') + '</div>';
const heading = (title, action = '') =>
  '<div class="heading"><h2>' + esc(title) + '</h2>' + action + '</div>';

export const triggerNames = {
  ready: 'При запуске Миры',
  focusEnd: 'По окончании фокуса',
  reminder: 'При напоминании',
};
export const kinds = {
  clipboardAI: 'Обработать текст буфера с ИИ',
  meeting: 'Открыть ближайшую встречу',
  quiet: 'Уведомления Миры',
  closeWindow: 'Закрыть окно программы',
  shutdownTimer: 'Таймер выключения ПК, мин',
  cancelShutdown: 'Отменить выключение ПК',
  say: 'Произнести текст',
  note: 'Записать заметку',
  task: 'Добавить задачу',
  focus: 'Запустить фокус, мин',
  wait: 'Подождать, сек',
  browser: 'Открыть браузер',
  url: 'Открыть сайт',
  file: 'Открыть файл или программу',
  search: 'Поиск в интернете',
  dance: 'Потанцевать',
  notify: 'Уведомление',
  theme: 'Сменить тему',
  ifTime: 'Условие по времени',
  processRunning: 'Программа запущена',
  switchTheme: 'Условие по теме',
  repeat: 'Повторить блоки',
  paste: 'Вставить текст в активное окно',
  keys: 'Нажать сочетание клавиш',
  music: 'Включить музыку',
};
const commandsIcon = {
  ifTime: 'clock-3',
  repeat: 'rotate-ccw',
  browser: 'globe',
  url: 'globe',
  file: 'folder-open',
  say: 'volume-2',
  note: 'notebook-pen',
  focus: 'timer',
  dance: 'music-2',
};
const keyList = [
  ['copy', 'Копировать'],
  ['paste', 'Вставить'],
  ['undo', 'Отменить'],
  ['save', 'Сохранить'],
  ['find', 'Найти'],
  ['selectAll', 'Выделить всё'],
];
const rowAction = (action, id, icon, label) =>
  '<button data-act="' +
  action +
  '" data-id="' +
  esc(id) +
  '" title="' +
  esc(label) +
  '" aria-label="' +
  esc(label) +
  '">' +
  ico(icon) +
  '</button>';
const entry = (s, kind) =>
  '<div class="entry ' +
  (s.done ? 'done' : '') +
  '">' +
  (kind === 'tasks'
    ? rowAction('toggleTask', s.id, s.done ? 'check-check' : 'circle-dot', 'Изменить состояние')
    : '') +
  '<span>' +
  esc(s.text) +
  (kind === 'events'
    ? '<br><small>' +
      esc(timeLabel(s.time)) +
      (s.routineId ? ' · запуск команды' : '') +
      (s.repeat === 'day' ? ' · ежедневно' : s.repeat === 'week' ? ' · еженедельно' : '') +
      (s.fired ? ' · завершено' : '') +
      '</small>'
    : '') +
  '</span>' +
  rowAction('edit-' + kind, s.id, 'pencil', 'Редактировать') +
  rowAction('remove-' + kind, s.id, 'x', 'Удалить') +
  '</div>';
const listBox = (s, kind, label, icon, placeholder) =>
  box(
    label,
    icon,
    (s[kind].length ? s[kind].map((i) => entry(i, kind)).join('') : empty(placeholder)) +
      acts(btn('Добавить', 'add-' + kind, 'plus')),
  );
const onOff = (label, key, current) =>
  select(
    label,
    key,
    [
      ['on', 'Включено'],
      ['off', 'Выключено'],
    ],
    current ? 'on' : 'off',
  );
const scale = (title, key, value, items) =>
  select(
    title,
    key,
    items.map((x) => [String(x), String(x)]),
    String(value),
  );
export const wallDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });
const wallTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
export function wallCalendar(date) {
  const parts = Object.fromEntries(wallDate.formatToParts(date).map(({ type, value }) => [type, value]));
  return '<b>' + parts.day + '</b><span>' + parts.month + '</span><small>' + parts.weekday + '</small>';
}
function clockFace(now) {
  return (
    '<div class="wallClock"><time data-wall-time>' +
    wallTime.format(now) +
    '</time><div class="clockDate" data-wall-date="' +
    now.toDateString() +
    '">' +
    wallCalendar(now) +
    '</div></div>'
  );
}
function weatherGlyph(code) {
  const condition =
    code === 0
      ? 'sun'
      : code < 4
        ? 'cloud'
        : code < 50
          ? 'mist'
          : (code >= 71 && code <= 77) || code === 85 || code === 86
            ? 'snow'
            : code >= 95
              ? 'storm'
              : 'rain';
  return (
    '<span class="weatherGlyph" aria-hidden="true" data-sky="' +
    condition +
    '"><i class="weatherSun"></i><i class="weatherCloud"></i><i class="weatherFall"></i></span>'
  );
}
export function desk(s, c, only) {
  const w = c.weather,
    r = c.rates,
    sys = c.sys;
  const music =
    '<div id="musicSlot"></div>' +
    acts(btn(s.music ? 'Сменить дорожку' : 'Выбрать дорожку', 'music', 'folder-open'));
  const prefs = s.settings;
  const money = ['USD', 'EUR', 'CNY', 'RUB'].map((x) => [x, x]);
  const temperature = (n) => Math.round(prefs.degree === 'F' ? 32 + n * 1.8 : n) + '°' + prefs.degree;
  const now = new Date();
  if (!only) return widgetBoard(s, c, { w, r, sys, prefs, temperature, now });
  const cards = {
    clock: box('Дата и время', 'clock-3', clockFace(now)),
    launch: box(
      'Быстрый запуск',
      'play',
      (s.shortcuts || [])
        .map(
          (x) =>
            '<div class="entry"><span>' +
            esc(x.name) +
            '</span>' +
            btn('Запустить', 'shortcutGo', 'play', '', x.id) +
            btn('Убрать', 'dropShortcut', 'x', '', x.id) +
            '</div>',
        )
        .join('') + btn('Добавить ярлык', 'addShortcut', 'plus'),
    ),
    crypto: box(
      'Криптовалюта',
      'banknote',
      select(
        'Монета',
        'cryptoCoin',
        [
          ['bitcoin', 'Bitcoin'],
          ['ethereum', 'Ethereum'],
          ['solana', 'Solana'],
        ],
        prefs.cryptoCoin,
      ) +
        select(
          'Валюта',
          'currency',
          [
            ['usd', 'USD'],
            ['eur', 'EUR'],
            ['rub', 'RUB'],
          ],
          prefs.currency,
        ) +
        (c.crypto?.coin === prefs.cryptoCoin && c.crypto.currency === prefs.currency
          ? '<strong>' +
            esc(c.crypto.value.toLocaleString('ru-RU')) +
            ' ' +
            esc(prefs.currency.toUpperCase()) +
            '</strong><p>' +
            esc(timeLabel(c.crypto.time)) +
            '</p>'
          : '') +
        btn('Обновить', 'crypto', 'refresh-cw'),
    ),
    focus: box(
      'Фокус',
      'timer',
      '<div class="clock" data-clock>' +
        timerTime(s.focus) +
        '</div>' +
        acts(
          btn(
            s.focus.ends
              ? 'Пауза'
              : s.focus.remaining > 0 && s.focus.remaining < 25 * 60000
                ? 'Продолжить'
                : '25 минут',
            'focusToggle',
            s.focus.ends ? 'pause' : 'play',
            'primary',
          ),
          btn('Сбросить', 'focusReset', 'rotate-ccw'),
          btn('Свой интервал', 'focusCustom', 'clock-3'),
        ),
    ),
    tasks: listBox(s, 'tasks', 'Задачи', 'list-checks', 'Здесь появятся твои задачи.'),
    notes: listBox(s, 'notes', 'Заметки', 'notebook-pen', 'Заметку можно надиктовать или записать здесь.'),
    reminders: listBox(s, 'events', 'Напоминания', 'calendar-days', 'Напоминаний пока нет.'),
    events: listBox(s, 'events', 'Календарь', 'calendar-days', 'Напоминаний пока нет.'),
    weather: box(
      'Погода',
      'cloud-sun',
      select(
        'Температура',
        'degree',
        [
          ['C', '°C'],
          ['F', '°F'],
        ],
        prefs.degree,
      ) +
        (w
          ? '<div class="clock">' +
            weatherGlyph(w.code) +
            temperature(w.temp) +
            '</div><p>' +
            esc(w.city) +
            '</p><p class="muted">Максимум на три дня · ' +
            w.days.map(temperature).join(' / ') +
            '</p>' +
            acts(btn('Обновить', 'weather', 'refresh-cw'))
          : '<p>' + esc(s.settings.city) + '</p>' + acts(btn('Узнать погоду', 'weather', 'cloud-sun'))),
    ),
    rates: box(
      'Курсы валют',
      'banknote',
      select('Из', 'exchangeFrom', money, prefs.exchangeFrom) +
        select('В', 'exchangeTo', money, prefs.exchangeTo) +
        btn('Поменять местами', 'swapRates', 'rotate-ccw') +
        (r
          ? '<p>1 ' +
            prefs.exchangeFrom +
            ' = ' +
            (r[prefs.exchangeFrom] / r[prefs.exchangeTo]).toLocaleString('ru-RU', {
              maximumFractionDigits: 4,
            }) +
            ' ' +
            prefs.exchangeTo +
            '</p><p>' +
            esc(timeLabel(r.date)) +
            ' · ЦБ РФ</p>'
          : '') +
        acts(btn('Получить курсы', 'rates', 'refresh-cw')),
    ),
    music: box('Плеер', 'music-2', music),
    system: box(
      'Система',
      'cpu',
      sys
        ? '<div class="clock">' +
            sys.ram +
            '%</div><p>Память · ' +
            sys.memory +
            ' ГБ</p><p class="muted">Загрузка процессора · ' +
            sys.cpu +
            '%' +
            (sys.gpu == null ? '' : ' · GPU 3D ' + sys.gpu + '%') +
            '</p>'
        : '<p class="muted">Получаю показания…</p>',
    ),
  };
  for (const id of ['tasks', 'focus', 'notes', 'events']) {
    const mode = s.screenWidgets?.[id];
    const place = select(
      'На экране ПК',
      'place-' + id,
      [
        ['off', 'В приложении'],
        ['window', 'В отдельном окне'],
        ['pin', 'Поверх окон'],
        ...(s.platform === 'win32' ? [['wallpaper', 'На слое обоев Windows']] : []),
      ],
      mode ? (mode.wallpaper ? 'wallpaper' : mode.pin ? 'pin' : 'window') : 'off',
    );
    cards[id] = cards[id].replace('</article>', place + '</article>');
  }
  return cards[only] || '';
}
function widgetBoard(s, c, { w, r, sys, prefs, temperature, now }) {
  const active = s.settings.widgets.filter((w) => w.visible);
  const tile = ({ id, width, height }) => {
    const open = rowAction('day', id, 'chevron-right', 'Открыть виджет «' + s.widgetNames[id] + '»');
    const symbols = {
      tasks: 'list-checks',
      notes: 'notebook-pen',
      mail: 'mail',
      events: 'calendar-days',
      reminders: 'calendar-days',
      clock: 'clock-3',
      focus: 'timer',
      system: 'cpu',
      music: 'music-2',
      weather: 'cloud-sun',
      rates: 'banknote',
      crypto: 'banknote',
      launch: 'play',
    };
    let body,
      addControl = '',
      meta = '';
    if (['notes', 'tasks', 'events', 'reminders'].includes(id)) {
      const scheduled = id === 'events' || id === 'reminders';
      const items = scheduled
        ? s.events
            .filter((e) =>
              id === 'reminders' ? e.category !== 'calendar' && !e.fired && !e.disabled : occursOn(e, now),
            )
            .sort((a, b) => a.time - b.time)
        : id === 'notes'
          ? sortedNotes(s.notes)
          : s.tasks.filter((t) => taskListOf(t) === s.activeTaskList);
      meta =
        id === 'events'
          ? now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
          : String(items.length);
      const placeholder = {
        notes: 'Чистый лист. Добавь первую заметку.',
        tasks: 'В этом списке пока пусто',
        events: 'Ничего не запланировано',
        reminders: 'Напоминаний пока нет.',
      };
      const addLabel = {
        notes: 'Новая заметка',
        tasks: 'Новая задача',
        events: 'Новое событие',
        reminders: 'Напомнить',
      }[id];
      if (id !== 'notes') addControl = rowAction('add-' + id, '', 'plus', addLabel);
      body = items.length
        ? items
            .slice(0, 2)
            .map((item) => entry(item, scheduled ? 'events' : id))
            .join('')
        : '<div class="boardEmpty">' + ico(symbols[id]) + '<p>' + placeholder[id] + '</p></div>';
      if (id === 'notes') {
        if (items.length)
          body =
            '<button class="boardNote" data-act="edit-notes" data-id="' +
            esc(items[0].id) +
            '">' +
            (items[0].pinned ? ico('pin') : '') +
            esc(noteLabel(items[0])) +
            '</button>';
        body += btn(addLabel, 'add-notes', 'plus');
      }
      if (id === 'tasks') {
        const draft = c.quickTask;
        const quick = draft
          ? '<input id="quickTask" aria-label="Текст задачи" maxlength="10000" placeholder="Задача..." value="' +
            esc(draft.text) +
            '">'
          : '';
        if (draft || items.length)
          body =
            (draft && !draft.id ? quick : '') +
            items
              .slice(0, 3)
              .map((t) =>
                draft?.id === t.id
                  ? quick
                  : '<div class="tileTask' +
                    (t.done ? ' done' : '') +
                    '">' +
                    rowAction(
                      'toggleTask',
                      t.id,
                      t.done ? 'check-check' : 'circle-dot',
                      'Изменить состояние',
                    ) +
                    '<button data-act="edit-tasks" data-id="' +
                    esc(t.id) +
                    '">' +
                    esc(t.text) +
                    '</button></div>',
              )
              .join('');
      }
    } else if (id === 'clock') {
      body = clockFace(now);
    } else if (id === 'focus') {
      body =
        '<div class="clock" data-clock>' +
        timerTime(s.focus) +
        '</div>' +
        btn(s.focus.ends ? 'Пауза' : 'Начать', 'focusToggle', s.focus.ends ? 'pause' : 'play');
    } else if (id === 'launch') {
      body =
        (s.shortcuts || [])
          .slice(0, 3)
          .map((v) => btn(v.name, 'shortcutGo', 'play', '', v.id))
          .join('') + btn('Добавить ярлык', 'addShortcut', 'plus');
    } else {
      const value = {
        mail: s.mail.latest || (s.mail.boxes ? 'Входящие' : 'Ящик не подключён'),
        system: sys ? sys.ram + '% памяти' : 'Получаю показания…',
        music: s.music?.name || 'Дорожка не выбрана',
        weather: w ? temperature(w.temp) + ' · ' + w.city : prefs.city,
        rates: r
          ? '1 ' +
            prefs.exchangeFrom +
            ' = ' +
            (r[prefs.exchangeFrom] / r[prefs.exchangeTo]).toLocaleString('ru-RU', {
              maximumFractionDigits: 4,
            }) +
            ' ' +
            prefs.exchangeTo
          : prefs.exchangeFrom + ' / ' + prefs.exchangeTo,
        crypto:
          c.crypto?.coin === prefs.cryptoCoin && c.crypto?.currency === prefs.currency
            ? c.crypto.value.toLocaleString('ru-RU') + ' ' + prefs.currency.toUpperCase()
            : prefs.cryptoCoin,
      };
      body =
        '<div class="boardValue">' +
        (id === 'weather' && w ? weatherGlyph(w.code) : '') +
        esc(value[id]) +
        '</div>' +
        btn('Подробнее', 'day', 'chevron-right', '', id);
    }
    const order = c.boardEditing
      ? '<div class="boardOrder">' +
        rowAction('boardUp', id, 'chevron-up', 'Переместить раньше') +
        rowAction('boardDown', id, 'chevron-down', 'Переместить позже') +
        '</div>' +
        rowAction('boardHide', id, 'trash-2', 'Удалить с рабочего стола: ' + s.widgetNames[id]) +
        rowAction('boardResize', id, 'corner-down-right', 'Изменить размер виджета: ' + s.widgetNames[id])
      : '';
    const dimensions =
      width && height ? ' boardSized" style="--tile-width:' + width + ';--tile-height:' + height : '';
    return (
      '<article class="box boardTile' +
      dimensions +
      '" data-tile="' +
      id +
      '" draggable="' +
      Boolean(c.boardEditing) +
      '"><div class="tileInner"><header>' +
      '<h3>' +
      ico(symbols[id]) +
      '<span>' +
      esc(
        id === 'tasks'
          ? s.taskLists.find((l) => l.id === s.activeTaskList)?.name || s.widgetNames[id]
          : s.widgetNames[id],
      ) +
      '</span>' +
      '</h3><small>' +
      esc(meta) +
      '</small>' +
      addControl +
      open +
      '</header>' +
      '<div class="boardBody">' +
      body +
      '</div>' +
      order +
      '</div></article>'
    );
  };
  return (
    '<div id="boardMenu" popover="auto" class="boardTools">' +
    btn(c.boardEditing ? 'Готово' : 'Редактировать', 'boardEdit', 'pencil') +
    btn('Виджеты', 'widgets', 'sliders-horizontal') +
    btn('Найти файл', 'find', 'search') +
    '</div>' +
    '<div class="deskGrid" aria-label="Рабочий стол">' +
    (active.length ? active.map(tile).join('') : empty('Выбери виджеты для рабочего стола.')) +
    '</div>' +
    (c.boardEditing
      ? '<div class="boardDock">' +
        ico('pencil') +
        '<span>Перетащи карточку, чтобы переместить. Потяни за угол, чтобы изменить размер.</span>' +
        btn('Добавить виджет', 'boardAdd', 'plus') +
        btn('Готово', 'boardDone', 'check', 'primary') +
        '</div>'
      : '')
  );
}
export function newRoutine() {
  return { name: 'Новая команда', phrase: '', hotkey: '', blocks: [{ kind: 'say', value: 'Привет!' }] };
}
const blockKeys = new WeakMap();
function blockKey(block) {
  if (!blockKeys.has(block)) blockKeys.set(block, crypto.randomUUID());
  return blockKeys.get(block);
}
export function commands(s, c) {
  const d = c.draft,
    list = s.routines;
  const setting = c.commandTab === 'settings';
  const head = heading(
    'Команды',
    '<nav class="commandTabs" aria-label="Раздел команд">' +
      [
        ['editor', 'Редактор команд'],
        ['settings', 'Настройки'],
      ]
        .map(
          ([id, title]) =>
            '<button data-act="commandTab" data-id="' +
            id +
            '" aria-current="' +
            (setting === (id === 'settings') ? 'page' : 'false') +
            '">' +
            title +
            '</button>',
        )
        .join('') +
      '</nav>',
  );
  if (setting) {
    const a = s.settings;
    return (
      head +
      '<div class="stack commandPreferences">' +
      box(
        'Автонастройка',
        'workflow',
        '<p>Команды для открытия приложений из меню «Пуск» Windows.</p>' +
          btn('Запустить автонастройку', 'scanCommandApps', 'search') +
          '<h4>Базовые команды</h4><p>Добавить готовые сценарии для работы, музыки и управления компьютером.</p>' +
          btn('Добавить базовые команды', 'addBaseCommands', 'plus'),
      ) +
      box(
        'Граф',
        'workflow',
        select(
          'Линии связей',
          'graphLines',
          [
            ['angular', 'Угловые'],
            ['round', 'Скруглённые'],
          ],
          a.graphLines,
        ),
      ) +
      box(
        'Сопоставление целых фраз',
        'message-circle',
        onOff('Допускать опечатки', 'allowTypos', a.allowTypos) +
          select(
            'Порог сходства',
            'phraseThreshold',
            Array.from({ length: 16 }, (_, i) => {
              const v = (85 + i) / 100;
              return [v, v.toFixed(2).replace('.', ',')];
            }),
            a.phraseThreshold,
          ) +
          '<p class="muted">Если фраза подходит нескольким командам, автоматический запуск пропускается.</p>',
      ) +
      box(
        'Выполнение команд',
        'timer',
        field('Лимит времени (секунды)', 'routineSeconds', a.routineSeconds, 'number') +
          field('Максимум шагов', 'routineSteps', a.routineSteps, 'number') +
          field('Максимум итераций цикла', 'routineRepeats', a.routineRepeats, 'number') +
          '<p class="muted">Ноль отключает таймер. Для шагов и повторов ноль задаёт предел 10 000.</p>' +
          btn('Сохранить пределы', 'saveRoutineLimits', 'save'),
      ) +
      '</div>'
    );
  }
  const iconAction = (title, action, icon) =>
    '<button class="cmdTool" data-act="' +
    action +
    '" title="' +
    title +
    '" aria-label="' +
    title +
    '">' +
    ico(icon) +
    '</button>';
  const groups = [...new Set([...s.commandGroups, ...list.map((x) => x.group || '')])];
  const side =
    '<aside class="box flowSide"><header><h3>Команды</h3>' +
    iconAction('Импорт команд', 'importPack', 'upload') +
    iconAction('Новая папка', 'newCommandGroup', 'folder-open') +
    iconAction('Новая команда', 'newRoutine', 'plus') +
    '</header>' +
    '<input type="search" id="commandQuery" class="control" placeholder="Поиск…" aria-label="Поиск команд" value="' +
    esc(c.commandQuery || '') +
    '">' +
    groups
      .map((group) => {
        const rows = list
          .filter((x) => (x.group || '') === group)
          .map((x) =>
            btn(
              x.name,
              'edit',
              d?.id === x.id ? 'circle-dot' : 'workflow',
              d?.id === x.id ? 'selected' : '',
              x.id,
            ),
          )
          .join('');
        return (
          '<section data-command-group="' +
          esc(group) +
          '">' +
          (group
            ? '<h4>' +
              esc(group) +
              '<button data-act="groupRoutine" data-id="' +
              esc(group) +
              '" aria-label="Добавить команду в папку">' +
              ico('plus') +
              '</button></h4>'
            : '') +
          rows +
          '</section>'
        );
      })
      .join('') +
    '<p id="noCommandMatches" class="muted" hidden>Совпадений нет</p>' +
    btn('Пример с YouTube', 'youtubeRoutine', 'globe') +
    btn('Из описания', 'describeCommand', 'workflow') +
    '</aside>';
  if (!d)
    return (
      head +
      '<div class="workflow">' +
      side +
      '<section class="commandEmpty">' +
      ico('workflow') +
      '<p>Выбери команду из списка или создай новую</p></section></div>'
    );
  const selected = Math.max(0, Math.min(c.node || 0, d.blocks.length - 1)),
    b = d.blocks[selected];
  const pos = d.blocks.map((n, i) => ({
    x: n.x ?? 32 + ((i + 1) % 3) * 204,
    y: n.y ?? 40 + Math.floor((i + 1) / 3) * 112,
  }));
  const width = Math.max(650, ...pos.map((p) => p.x + 194)),
    height = Math.max(260, ...pos.map((p) => p.y + 108));
  const wires = [],
    nodes = [];
  const edge = (x, y, target, alt = false) => {
    if (!target) return;
    const endX = target.x,
      endY = target.y + 32;
    const bend = Math.max(27, Math.abs(endX - x) * 0.44);
    const path =
      s.settings.graphLines === 'angular'
        ? 'M ' + x + ' ' + y + ' H ' + (x + endX) / 2 + ' V ' + endY + ' H ' + endX
        : 'M ' +
          x +
          ' ' +
          y +
          ' C ' +
          (x + bend) +
          ' ' +
          y +
          ' ' +
          (endX - bend) +
          ' ' +
          endY +
          ' ' +
          endX +
          ' ' +
          endY;
    wires.push('<path class="' + (alt ? 'alt' : '') + '" d="' + path + '"/>');
  };
  edge(204, 72, pos[0]);
  for (const [i, n] of d.blocks.entries()) {
    const p = pos[i],
      branch = ['ifTime', 'switchTheme', 'processRunning', 'repeat'].includes(n.kind);
    edge(p.x + 172, p.y + 32, pos[n.next ?? i + 1]);
    if (branch) edge(p.x + 172, p.y + 47, pos[n.alternate ?? i + 1], true);
    const preview =
      n.kind === 'file' ? s.files.find((f) => f.id === n.value)?.name || 'Выбрать файл' : n.value;
    nodes.push(
      '<button type="button" class="flowNode ' +
        (i === selected ? 'chosen' : '') +
        '" style="left:' +
        p.x +
        'px;top:' +
        p.y +
        'px" data-motion-id="' +
        blockKey(n) +
        '" data-node="' +
        i +
        '"><b>' +
        ico(commandsIcon[n.kind] || 'blocks') +
        esc(kinds[n.kind]) +
        '</b><small>' +
        esc(preview || 'Действие') +
        '</small></button>',
    );
  }
  let inspector = '';
  if (b) {
    let value = field(b.kind === 'url' ? 'Ссылка' : 'Значение', 'nodeValue', b.value);
    if (b.kind === 'theme' || b.kind === 'switchTheme')
      value = select('Тема', 'nodeValue', themeList, b.value);
    if (b.kind === 'file')
      value = select(
        'Файл или программа',
        'nodeValue',
        [['', 'Выбрать'], ...s.files.map((f) => [f.id, f.name])],
        b.value,
      );
    if (b.kind === 'keys') value = select('Сочетание', 'nodeValue', keyList, b.value);
    if (b.kind === 'quiet')
      value = select(
        'Режим',
        'nodeValue',
        [
          ['on', 'Только в окне Миры'],
          ['off', 'Показывать в Windows'],
        ],
        b.value,
      );
    if (b.kind === 'clipboardAI') value = field('Задание для ИИ', 'nodeValue', b.value);
    if (['browser', 'dance', 'music', 'meeting', 'cancelShutdown'].includes(b.kind)) value = '';
    if (['processRunning', 'closeWindow'].includes(b.kind))
      value = field('Имя процесса · notepad.exe', 'nodeValue', b.value);
    if (b.kind === 'ifTime') value = field('Диапазон часов · 09-18', 'nodeValue', b.value);
    const ends = d.blocks
      .map((n, j) => [j, j + 1 + ' · ' + kinds[n.kind]])
      .concat([[d.blocks.length, 'Завершить']]);
    const branch = ['repeat', 'ifTime', 'processRunning', 'switchTheme'].includes(b.kind);
    inspector =
      '<div class="inspector" data-edit-node="' +
      selected +
      '"><div class="subhead"><h3>' +
      ico(commandsIcon[b.kind] || 'blocks') +
      esc(kinds[b.kind]) +
      '</h3><div class="row">' +
      rowAction('up', selected, 'move-up', 'Переместить раньше') +
      rowAction('down', selected, 'move-down', 'Переместить позже') +
      rowAction('drop', selected, 'trash-2', 'Удалить блок') +
      '</div></div><div class="inspectFields">' +
      value +
      select(
        b.kind === 'repeat' ? 'После повторов' : branch ? 'Да' : 'Далее',
        'nodeNext',
        ends,
        b.next ?? selected + 1,
      ) +
      (branch ? select(b.kind === 'repeat' ? 'Повторять с' : 'Нет', 'nodeAlt', ends, b.alternate ?? 0) : '') +
      '</div></div>';
  }
  const flow =
    '<div class="flowViewport"><div class="flowMap" style="width:' +
    width +
    'px;height:' +
    height +
    'px"><svg class="wires" width="' +
    width +
    '" height="' +
    height +
    '" aria-hidden="true">' +
    wires.join('') +
    '</svg><div class="flowNode trigger" style="left:32px;top:40px"><b>' +
    ico('mic') +
    'Фраза или хоткей</b><small>' +
    esc(d.phrase || d.hotkey || 'Ручной запуск') +
    '</small></div>' +
    nodes.join('') +
    '</div></div>';
  return (
    head +
    '<div class="workflow">' +
    side +
    '<article class="editPanel">' +
    '<div class="workflowHeader">' +
    field('Название', 'rName', d.name) +
    acts(btn('Запустить', 'runRoutine', 'play'), btn('Сохранить', 'saveRoutine', 'save', 'primary')) +
    '</div><div class="workflowFields">' +
    field('Голосовая фраза', 'rPhrase', d.phrase) +
    field('Горячая клавиша', 'rHotkey', d.hotkey) +
    field('Группа', 'rGroup', d.group || '') +
    '</div>' +
    (d.phrase ? '<p class="muted">Для голосового запуска скажи «' + esc((s.settings.wakeAlias || 'Мира') + ', ' + d.phrase) + '».</p>' : '') +
    '<div class="flowTools"><select class="control" id="kind">' +
    Object.entries(kinds)
      .concat(
        s.extensions.flatMap((p) =>
          (p.contributions?.blocks || []).map((b) => [
            'snippet:' + p.routines[b.command],
            p.name + ' · ' + b.name,
          ]),
        ),
      )
      .map(([k, v]) => opt(k, v, ''))
      .join('') +
    '</select>' +
    btn('Блок', 'addBlock', 'plus') +
    btn('Разложить', 'layoutNodes', 'workflow') +
    btn(c.expanded ? 'Свернуть' : 'Развернуть', 'expandNodes', 'maximize-2') +
    '</div>' +
    flow +
    inspector +
    acts(
      btn('Остановить', 'cancelRun', 'circle-stop'),
      ...(d.id
        ? [btn('Экспорт', 'exportRoutine', 'download'), btn('Удалить', 'removeRoutine', 'trash-2')]
        : []),
    ) +
    '</article></div>'
  );
}
export function captureDraft(d) {
  if (!d || !$('#rName')) return;
  d.name = $('#rName').value;
  d.group = $('#rGroup').value;
  d.phrase = $('#rPhrase').value;
  d.hotkey = $('#rHotkey').value;
  const e = $('[data-edit-node]'),
    b = e && d.blocks[+e.dataset.editNode];
  if (b) {
    b.value = $('#nodeValue')?.value ?? '';
    b.next = +$('#nodeNext').value;
    if ($('#nodeAlt')) b.alternate = +$('#nodeAlt').value;
  }
}
export function reorder(d, from, to) {
  const old = [...d.blocks];
  if (!old[from] || to < 0 || to >= old.length) return;
  const next = [...old];
  next.splice(to, 0, next.splice(from, 1)[0]);
  d.blocks = next.map((b, i) => {
    const j = old.indexOf(b);
    const dest = (v) =>
      v === undefined || v === j + 1 ? i + 1 : v === old.length ? next.length : next.indexOf(old[v]);
    return { ...b, next: dest(b.next), alternate: dest(b.alternate) };
  });
}
const modelSections = [
  ['characters', 'Персонажи'],
  ['animations', 'Анимации'],
  ['appearance', 'Внешний вид'],
  ['window', 'Окно'],
  ['advanced', 'Дополнительно'],
];
export function model(s, c) {
  const a = s.settings;
  const tab = c.modelTab || 'characters';
  const character = s.avatars.find((v) => v.id === a.avatar)?.name || 'Вита';
  const look =
    a.avatar === 'vita'
      ? select(
          'Наряд Виты',
          'outfit',
          s.outfits.map((o) => [o.id, o.name]),
          a.outfit,
        )
      : '';
  const preview = btn(
    c.modelPreview ? 'Закрыть просмотр' : 'Посмотреть персонажа',
    'modelPreview',
    'user-round',
  );
  let content;
  switch (tab) {
    case 'animations':
      content = box(
        'Что она умеет играть',
        'orbit',
        select(
          'Эмоция',
          'emotion',
          [['', 'По ситуации'], ...(c.catalog?.emotions || []).map((e) => [e.id, e.title])],
          c.emotion,
        ) +
          acts(
            preview,
            btn('По ситуации', 'playModelClip', 'orbit', '', 'auto'),
            btn('Потанцевать', 'dance', 'music-2'),
          ) +
          '<div class="clipList">' +
          (c.catalog?.clips || [])
            .map(
              (clip) =>
                '<div><span>' +
                esc(clip.title) +
                '</span>' +
                btn('Показать', 'playModelClip', 'play', '', clip.id) +
                '</div>',
            )
            .join('') +
          '</div>',
      );
      break;
    case 'appearance':
      content =
        box('Внешний вид', 'user-round', look + acts(preview)) +
        box(
          'Движение',
          'orbit',
          select(
            'Уменьшение движения',
            'reduced',
            [
              ['off', 'Выключено'],
              ['on', 'Включено'],
            ],
            a.reduced ? 'on' : 'off',
          ),
        );
      break;
    case 'window':
      content =
        box(
          'Размер',
          'monitor',
          select(
            'Высота окна персонажа',
            'overlayHeight',
            [300, 440, 600, 750].map((v) => [v, v + ' пикс.']),
            a.overlayHeight,
          ),
        ) +
        box(
          'Расположение',
          'monitor',
          select(
            'Угол экрана',
            'overlayAnchor',
            [
              ['bottom-right', 'Справа внизу'],
              ['bottom-left', 'Слева внизу'],
              ['top-right', 'Справа вверху'],
              ['top-left', 'Слева вверху'],
            ],
            a.overlayAnchor,
          ) +
            acts(
              btn(s.seated && !s.seatOnTaskbar ? 'Встать' : 'Сесть на край окна', 'seat', 'pin'),
              btn(s.seatOnTaskbar ? 'Встать с панели' : 'Сесть на панель задач', 'seatTaskbar', 'monitor'),
              btn(a.showAvatar ? 'Скрыть на главной' : 'Показать на главной', 'showAvatar', 'user-round'),
              preview,
            ),
        );
      break;
    case 'advanced':
      content =
        box(
          'Отрисовка',
          'monitor',
          select(
            'Целевая частота кадров',
            'fps',
            [30, 60, 120, 240].map((v) => [v, v + ' кадров/с']),
            a.fps,
          ) +
            acts(preview) +
            '<p class="muted" id="frameMeter" aria-live="off"></p>',
        ) +
        box(
          'Игры и VMC',
          'cable',
          '<p class="muted">Передача движений и мимики на этом ПК. В Minecraft Java выбери VRM в моде ArmorStand и включи приём VMC на том же порту.</p>' +
            field('Порт получателя', 'motionPort', String(s.motionPort || 39539), 'number') +
            acts(
              btn(s.motionPort ? 'Остановить передачу' : 'Передавать движения', 'motionOutput', 'cable'),
              btn('Сохранить VRM', 'exportAvatar', 'download'),
              btn(
                'Страница мода',
                'source',
                'external-link',
                '',
                'https://github.com/TouchController/ArmorStand',
              ),
            ),
        );
      break;
    default:
      content = box(
        'Персонажи',
        'user-round',
        select(
          'Персонаж',
          'avatarPick',
          [['vita', 'Вита'], ...s.avatars.map((v) => [v.id, v.name])],
          a.avatar,
        ) + acts(btn('Добавить персонажа', 'avatar', 'plus'), preview),
      );
  }
  return (
    '<div class="modelWorkspace">' +
    heading('3D-компаньон') +
    '<div class="companionBar"><strong>' +
    esc(character) +
    '</strong><button type="button" role="switch" aria-checked="' +
    Boolean(s.overlay) +
    '" data-act="overlay">Включить компаньона <i></i></button></div>' +
    '<nav class="modelSections" aria-label="Разделы модели">' +
    modelSections
      .map(
        ([key, title]) =>
          '<button data-act="modelSection" data-id="' +
          key +
          '" aria-current="' +
          (tab === key ? 'page' : 'false') +
          '">' +
          title +
          '</button>',
      )
      .join('') +
    '</nav><div class="stack">' +
    content +
    '</div></div>'
  );
}
function voiceLibrary(s, c) {
  const a = s.settings,
    saved = s.fishFavorites || [],
    favorites = c.fishTab === 'saved',
    rows = favorites ? saved : c.fishList || [];
  const list = rows
    .map((v) => {
      const selected = a.fishVoice === v.id && (a.voice === 'fish' || a.fishPending);
      const starred = saved.some((x) => x.id === v.id);
      const playing = c.previewId === v.id;
      const initials = v.title.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('');
      return (
        '<li class="voiceCard" data-selected="' + selected + '" data-preview="' + playing + '">' +
        '<div class="voiceCardHead"><span class="voiceGlyph" aria-hidden="true">' + esc(initials) +
        (v.cover && /^[a-f0-9]{32}$/i.test(v.id)
          ? '<img class="voiceCover" alt="" loading="lazy" referrerpolicy="no-referrer" src="https://public-platform.r2.fish.audio/coverimage/' + v.id + '">'
          : '') +
        '</span><div><strong>' + esc(v.title) +
        '</strong><small>' +
        esc([v.author, v.languages].filter(Boolean).join(' · ')) +
        '</small></div><button class="voiceStar" data-act="fishStar" data-id="' + esc(v.id) +
        '" aria-pressed="' + starred + '" aria-label="' +
        (starred ? 'Убрать из избранного' : 'В избранное') + '"><span aria-hidden="true">' +
        (starred ? '★' : '☆') + '</span></button></div>' +
        '<div class="voiceCardActions">' +
        (v.sample === false
          ? ''
          : btn(
              c.previewId === v.id ? 'Остановить' : 'Послушать',
              'fishPreview',
              c.previewId === v.id ? 'square' : 'play',
              '',
              v.id,
            )) +
        btn(
          selected ? (a.fishPending ? 'Ожидает ключ' : 'Выбран') : 'Выбрать',
          'fishPick',
          selected ? 'check' : '',
          selected ? 'selectedVoice' : 'chooseVoice',
          v.id,
        ) +
        '</div></li>'
      );
    })
    .join('');
  return (
    '<article class="box voiceLibrary"><h3>' +
    ico('audio-lines') +
    'Озвучивание</h3><div class="voiceProvider">' +
    select('Голос ответов', 'voicePick', [
      ['builtin', 'Руслан · локальный'],
      ['system', 'Голос Windows'],
      ['speechAPI', 'Совместимый голосовой сервис'],
      ['fish', 'Fish Audio · облако'],
      ...s.voices.map((v) => [v.id, v.name]),
    ], a.voice) +
    (a.voice === 'system'
      ? select('Установленные голоса', 'sysVoice', [['', 'По умолчанию'], ...(c.sysVoices || []).map(v => [v, v])], a.systemVoice)
      : '') +
    acts(btn('Послушать текущий голос', 'audition', 'play'), btn('Импорт .onnx', 'voiceFile', 'upload')) +
    '</div><section class="voiceCatalog"><header><h4>Библиотека голосов</h4><b>Fish Audio</b></header>' +
    '<form id="fishSearchForm"><label for="fishQuery">Название или имя</label><div><input id="fishQuery" maxlength="120" placeholder="Например, Братишкин или Джарвис" value="' +
    esc(c.fishInput ?? c.fishQuery ?? '') +
    '"><button class="btn" type="submit">' +
    ico('search') +
    'Найти</button></div></form>' +
    acts(
      btn('Результаты поиска', 'fishResults', 'list-checks', favorites ? '' : 'activeVoiceTab'),
      btn('Избранное · ' + saved.length, 'fishSaved', 'heart', favorites ? 'activeVoiceTab' : ''),
    ) +
    '<div aria-live="polite">' +
    (c.fishError && !favorites
      ? esc(c.fishError)
      : c.fishLoading && !favorites
        ? '<span class="pendingCaption">Ищу голоса…</span>'
        : !rows.length
          ? favorites
            ? 'Пока нет избранных голосов'
            : c.fishList
              ? 'Ничего не найдено'
              : ''
          : '') +
    '</div>' +
    '<ul class="fishRows">' +
    list +
    '</ul>' +
    (!favorites && (c.fishPage > 1 || c.fishMore)
      ? acts(
          c.fishPage > 1 ? btn('Назад', 'fishPrev', 'chevron-left') : '',
          c.fishMore ? btn('Дальше', 'fishNext', 'chevron-right') : '',
        )
      : '') +
    '<details class="fishAccess"' + (a.fishPending || c.fishKeyFocus ? ' open' : '') +
    '><summary>Подключение Fish Audio</summary>' +
    (a.fishVoiceName && (a.voice === 'fish' || a.fishPending)
      ? '<strong>' +
        esc(a.fishVoiceName) +
        (a.fishPending ? ' · выбран для подключения' : ' · голос ответов') +
        '</strong>'
      : '') +
    '<p>Примеры из Fish Audio можно слушать бесплатно. Чтобы Мира произносила свои ответы выбранным голосом, нужен ключ Fish Audio.</p>' +
    field(
      s.keys.includes('fish') ? 'Ключ Fish Audio сохранён · заменить' : 'Ключ Fish Audio',
      'fishKey',
      '',
      'password',
    ) +
    btn('Сохранить ключ', 'keyFish', 'save') +
    '</details></section></article>'
  );
}
export function voice(s, c) {
  const a = s.settings;
  const options = (rows, selected, label) => {
    const list = [
      ['', 'По умолчанию'],
      ...(rows || [])
        .filter((d) => d.deviceId && d.deviceId !== 'default')
        .map((d, i) => [d.deviceId, d.label || label + ' ' + (i + 1)]),
    ];
    if (selected && !list.some(([id]) => id === selected))
      list.push([selected, 'Ранее выбранное устройство']);
    return list;
  };
  return (
    heading('Голос') +
    '<div class="grid">' +
    voiceLibrary(s, c) +
    box(
      'Микрофон и динамики',
      'mic',
      select(
        'Микрофон для распознавания голоса',
        'microphoneId',
        options(c.audioDevices?.inputs, a.microphoneId, 'Микрофон'),
        a.microphoneId,
      ) +
        (c.audioDevices?.canRoute === false
          ? ''
          : select(
              'Устройство вывода звука',
              'speakerId',
              options(c.audioDevices?.outputs, a.speakerId, 'Динамики'),
              a.speakerId,
            )) +
        '<div class="micTest"><meter id="micLevel" min="0" max="1" value="0" aria-label="Уровень микрофона"></meter><output id="micReading">Проверка микрофона</output></div>' +
        acts(
          btn(c.testingMic ? 'Завершить проверку' : 'Проверить микрофон', 'testMic', 'mic'),
          btn('Проверить голос', 'audition', 'volume-2'),
        ),
    ) +
    box(
      'Параметры разговора',
      'audio-lines',
      scale('Скорость речи', 'speechRate', a.speechRate, [0.7, 0.85, 1, 1.15, 1.3, 1.5]) +
        scale('Громкость воспроизведения', 'speechVolume', a.speechVolume, [0, 0.25, 0.5, 0.75, 1]) +
        scale('Пауза до ответа, сек', 'silence', a.silence, [0.45, 0.6, 0.78, 1, 1.4, 2]) +
        select(
          'Чувствительность микрофона',
          'sensitivity',
          [
            ['0.006', 'Высокая'],
            ['0.012', 'Средняя'],
            ['0.025', 'Низкая'],
          ],
          String(a.sensitivity),
        ) +
        onOff('Можно перебивать ответ голосом', 'interruptReplies', a.interruptReplies) +
        '<p>Скажи «Мира» перед каждым вопросом. Можно произнести имя отдельно и начать вопрос в течение десяти секунд.</p>' +
        field('Слово активации', 'wakeAlias', a.wakeAlias || 'Мира') +
        btn('Сохранить слово', 'saveWake', 'save'),
    ) +
    box(
      'Локальные голоса',
      'volume-2',
      '<p>Ирина · русский женский голос · 63,2 МБ</p>' +
        acts(
          s.voices.some((v) => v.id === 'piper-irina')
            ? btn('Выбрать Ирину', 'pickIrina', 'check')
            : c.voiceLoading
              ? btn('Остановить загрузку', 'pauseVoice', 'pause')
              : btn('Скачать голос', 'installVoice', 'download'),
        ),
    ) +
    box(
      'Разговор',
      'mic',
      '<p class="muted">Мира слушает до паузы, отвечает вслух и снова включает микрофон. В ожидании имени речь распознаётся на этом компьютере.</p>' +
        acts(
          btn('Начать разговор', 'voice', 'mic', 'primary'),
          btn('Ждать обращения «' + (a.wakeAlias || 'Мира') + '»', 'standby', 'audio-lines'),
        ),
    ) +
    box(
      'Голосовой сервис',
      'cable',
      select(
        'Распознавание речи',
        'stt',
        [
          ['local', 'Whisper · на этом ПК'],
          ['speechAPI', 'Голосовой сервис'],
        ],
        a.stt,
      ) +
        field('Адрес API', 'speechBase', a.speechService.base) +
        field('Модель распознавания', 'sttModel', a.speechService.sttModel) +
        field('Модель озвучивания', 'ttsModel', a.speechService.ttsModel) +
        field('Имя голоса', 'apiVoice', a.speechService.voice) +
        field(
          s.keys.includes('speechAPI') ? 'Ключ сохранён · заменить' : 'Ключ, если требуется',
          'speechKey',
          '',
          'password',
        ) +
        acts(btn('Сохранить сервис', 'saveSpeechService', 'save')),
    ) +
    '</div>'
  );
}
export const providerPresets = [
  ['https://api.openai.com/v1', 'OpenAI'],
  ['https://openrouter.ai/api/v1', 'OpenRouter'],
  ['https://api.deepseek.com/v1', 'DeepSeek', 'deepseek-chat'],
  ['https://api.mistral.ai/v1', 'Mistral AI', 'mistral-small-latest'],
  ['https://api.groq.com/openai/v1', 'Groq', 'llama-3.3-70b-versatile'],
  ['https://api.together.ai/v1', 'Together AI', 'meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  ['https://api.anthropic.com/v1', 'Anthropic Claude'],
  ['https://generativelanguage.googleapis.com/v1beta/openai', 'Google Gemini'],
  ['https://api.x.ai/v1', 'xAI'],
  ['https://api.moonshot.ai/v1', 'Moonshot / Kimi'],
  ['http://127.0.0.1:11434/v1', 'Ollama'],
  ['http://127.0.0.1:1234/v1', 'LM Studio'],
];
export function ai(s, c) {
  const a = s.settings;
  return (
    heading('Искусственный интеллект', btn('Фоновые помощники и изображения', 'assistants', 'sparkles')) +
    '<div class="grid">' +
    box(
      'Источник ответов',
      'brain-circuit',
      select(
        'Режим',
        'provider',
        [
          ['local', 'Локальная модель · llama.cpp'],
          ['endpoint', 'Сервис или локальный сервер'],
        ],
        a.provider,
      ) +
        (a.provider === 'endpoint'
          ? select('Подставить адрес', 'preset', [['', 'Свой сервер'], ...providerPresets], a.base) +
            field('Адрес API', 'base', a.base) +
            field('Название модели', 'cloudModel', a.cloudModel) +
            (c.availableAI?.base === a.base && c.availableAI.ids.length
              ? select('Доступные модели', 'availableAI', [['', 'Выбрать модель'], ...c.availableAI.ids.map(id => [id, id])], a.cloudModel)
              : '') +
            (c.aiModelStatus ? '<p role="status">' + esc(c.aiModelStatus) + '</p>' : '') +
            field(
              s.keys.includes('ai') ? 'API-ключ сохранён · заменить' : 'API-ключ',
              'aiKey',
              '',
              'password',
            ) +
            acts(btn('Сохранить подключение', 'saveAI', 'save', 'primary') +
              btn('Загрузить модели', 'listAI', 'refresh-cw'))
          : '<p class="muted">Вес модели скачивается на ПК один раз. Для запуска используется встроенный llama.cpp.</p>') +
        '<hr>' +
        field('Роль собеседника', 'role', a.role) +
        acts(btn('Сохранить роль', 'saveRole', 'save')),
    ) +
    box(
      'Сохранённые API-ключи',
      'key-round',
      ((s.aiKeys || []).length
        ? '<ul>' + s.aiKeys.map(base =>
            '<li>' + esc(providerPresets.find(p => p[0] === base)?.[1] || base) +
            ' <button class="text" data-act="useSavedAI" data-id="' + esc(base) + '">Подключить</button>' +
            ' <button class="text" data-act="forgetAI" data-id="' + esc(base) + '">Удалить</button></li>').join('') + '</ul>'
        : '<p class="muted">Ключей для ИИ пока нет.</p>') +
        '<p class="muted">' + esc([
          ['search', 'Tavily'], ['images', 'OpenAI Images'], ['fish', 'Fish Audio'],
          ['speechAPI', 'Сервис речи'], ['telegram', 'Telegram'], ['workshop', 'Мастерская'],
        ].filter(([id]) => s.keys.includes(id)).map(([,label]) => label).join(' · ')) + '</p>',
    ) +
    box(
      'Поиск в интернете',
      'globe',
      '<p class="muted">Поиск возвращает ссылки на страницы. Можно подключить Tavily для поиска с выдержками из источников.</p>' +
        field(
          s.keys.includes('search') ? 'Ключ Tavily сохранён · заменить' : 'Ключ Tavily',
          'searchKey',
          '',
          'password',
        ) +
        onOff('При сбое Tavily искать через DuckDuckGo или Bing', 'searchFallback', a.searchFallback) +
        acts(btn('Сохранить', 'keySearch', 'save'), btn('Поиск', 'searchNow', 'search')),
    ) +
    '<article class="box" style="grid-column:1/-1"><h3>' +
    ico('hard-drive') +
    'Модели на компьютере</h3><p class="muted">Оценка по общему объёму ОЗУ. Свободная память, видеокарта и длина ответа влияют на скорость.</p>' +
    s.models
      .map((m) => {
        const progress = c.progress?.id === m.id ? c.progress.count : m.partial;
        return (
          '<div class="modelCard"><div><b>' +
          esc(m.name) +
          '</b> <span class="chip">' +
          esc(m.quant) +
          '</span><p>' +
          (m.bytes / 1e9).toFixed(2) +
          ' ГБ · ' +
          (m.recommended ? 'Подходит по объёму ОЗУ' : 'Возможны медленная работа и нехватка памяти') +
          ' · ориентир ' +
          m.ram +
          ' ГБ ОЗУ</p>' +
          (m.busy
            ? '<progress aria-label="Загрузка модели" max="' +
              m.bytes +
              '" value="' +
              Math.max(0, progress || 0) +
              '"></progress>'
            : '') +
          '</div>' +
          (m.busy
            ? btn('Пауза · ' + Math.floor((progress / m.bytes) * 100) + '%', 'pauseDownload', 'pause')
            : m.installed
              ? btn(
                  a.model === m.id && a.provider === 'local' ? 'Выбрана' : 'Использовать',
                  'useModel',
                  'check',
                  '',
                  m.id,
                )
              : btn(m.partial ? 'Продолжить' : 'Скачать', 'download', 'download', '', m.id)) +
          (m.installed || (!m.busy && m.partial)
            ? rowAction('removeModel', m.id, 'trash-2', 'Удалить файл модели')
            : '') +
          (m.installed && m.visionBytes
            ? m.visionInstalled
              ? '<span class="chip">Распознаёт изображения</span>'
              : m.visionBusy
                ? btn(
                    'Приостановить модуль ' +
                      Math.round((c.progress?.vision ? c.progress.count / c.progress.total : 0) * 100) +
                      '%',
                    'pauseDownload',
                    'pause',
                  )
                : btn(
                    (m.visionPartial ? 'Продолжить загрузку модуля · ' : 'Скачать модуль изображений · ') +
                      (m.visionBytes / 1e6).toFixed(0) +
                      ' МБ',
                    'downloadVision',
                    'image',
                    '',
                    m.id,
                  )
            : '') +
          (!m.visionBusy && (m.visionInstalled || m.visionPartial)
            ? rowAction('removeVision', m.id, 'trash-2', 'Удалить модуль изображений')
            : '') +
          '</div>'
        );
      })
      .join('') +
    '</article></div>'
  );
}
export function plugins(s, c) {
  return (
    heading('Мастерская', btn('Импорт набора', 'importPack', 'upload')) +
    '<div class="grid">' +
    box(
      'Дополнения',
      'blocks',
      [
        ['chess', 'Шахматы', 'Игра с Мирой · три уровня'],
        ['cat', 'Кот-компаньон', 'Гуляет по окну и реагирует на нажатия'],
        ['shadow', 'Театр теней', 'Танец Виты, видео и Bad Apple!!'],
        ['freedoom', 'Freedoom', 'Классический Doom с уровнями Freedoom'],
      ]
        .map(
          ([id, name, detail]) =>
            '<div class="modelCard"><div><b>' +
            name +
            '</b><p>' +
            detail +
            '</p></div><div class="actions">' +
            ((s.pluginIds || []).includes(id)
              ? (id === 'cat' ? '' : btn('Открыть', 'panel', 'play', '', id)) +
                (id === 'freedoom' && s.platform === 'win32'
                  ? btn('Окно со звуком', 'nativeGame', 'volume-2')
                  : '') +
                btn('Убрать', 'pluginOff', 'x', '', id)
              : btn('Включить', 'pluginOn', 'plus', '', id)) +
            '</div></div>',
        )
        .join(''),
    ) +
    box(
      'Готовые сценарии',
      'library',
      s.extensionPresets
        .map(
          (p) =>
            '<div class="modelCard"><div><b>' +
            esc(p.name) +
            '</b><p>' +
            esc(p.detail) +
            '</p></div>' +
            (s.extensions.some((x) => x.id === p.id)
              ? btn('Удалить', 'removePack', 'x', '', p.id)
              : btn('Установить', 'pack', 'plus', '', p.id)) +
            '</div>',
        )
        .join('') +
        s.extensions
          .filter((p) => !s.extensionPresets.some((x) => x.id === p.id))
          .map(
            (p) =>
              '<div class="entry"><span>' +
              esc(p.name) +
              '</span>' +
              (Object.keys(p.contributions || {}).length
                ? btn('Открыть', 'extensionPanel', 'blocks', '', p.id)
                : '') +
              btn('Удалить', 'removePack', 'x', '', p.id) +
              '</div>',
          )
          .join(''),
    ) +
    box(
      'Каталоги сообщества',
      'globe',
      field('Адрес JSON-каталога', 'catalogURL', s.catalogURL || '') +
        acts(btn('Загрузить каталог', 'community', 'download')) +
        (c.community || [])
          .map(
            (pack) =>
              '<div class="entry"><span>' +
              esc(pack.name) +
              '<br><small>' +
              esc(pack.detail || pack.count + ' команд') +
              '</small></span>' +
              (s.extensions.some((x) => x.id === pack.id)
                ? 'Установлен'
                : btn('Установить', 'communityInstall', 'plus', '', pack.id)) +
              '</div>',
          )
          .join(''),
    ) +
    box(
      'Мои работы и сообщество',
      'library',
      field('Репозиторий GitHub', 'workRepo', s.workshopRepo || '') +
        field(
          s.keys.includes('workshop')
            ? 'Токен сохранён · заменить'
            : 'Токен для приватного каталога или публикации',
          'workToken',
          '',
          'password',
        ) +
        acts(btn('Подключить', 'workConnect', 'link'), btn('Открыть каталог', 'workBrowse', 'library')) +
        (c.workRows || [])
          .map(
            (w) =>
              '<div class="entry"><span>' +
              esc(w.name) +
              '</span>' +
              btn('Посмотреть', 'workInspect', 'search', '', w.key) +
              '</div>',
          )
          .join('') +
        (s.workshopRepo
          ? select(
              'Команда или набор',
              'workChoice',
              [
                ...s.routines.map((r) => [r.id, r.name]),
                ...s.extensions.map((p) => ['ext:' + p.id, 'Набор · ' + p.name]),
              ],
              '',
            ) +
            acts(btn('Подготовить публикацию', 'workPrepare', 'upload')) +
            Object.keys(s.published || {})
              .filter((k) => k.startsWith(s.workshopRepo + '#'))
              .map((k) => {
                const id = k.split('#').at(-1);
                return (
                  '<div class="entry"><span>' +
                  esc(s.routines.find((r) => r.id === id)?.name || 'Опубликованная работа') +
                  '</span>' +
                  btn('Снять с публикации', 'workRemove', 'x', '', id) +
                  '</div>'
                );
              })
              .join('')
          : ''),
    ) +
    box(
      'MCP-серверы',
      'cable',
      (s.tools.length
        ? '<p class="muted">В чате напиши «Через ' + esc(s.tools[0].name) + ' …» и добавь запрос.</p>'
        : '') +
        s.tools
          .map(
            (t) =>
              '<div class="entry"><span>' +
              esc(t.name) +
              '</span>' +
              btn('Инструменты', 'mcpList', 'blocks', '', t.id) +
              rowAction('remove-tools', t.id, 'x', 'Удалить') +
              '</div>',
          )
          .join('') +
        acts(btn('Подключить сервер', 'newMcp', 'plus')),
    ) +
    box(
      'Telegram',
      'send',
      field(
        s.keys.includes('telegram') ? 'Токен бота сохранён · заменить' : 'Токен своего бота',
        'tgKey',
        '',
        'password',
      ) +
        acts(
          btn('Сохранить токен', 'keyTelegram', 'save'),
          btn(s.paired ? 'Отключить' : 'Связать аккаунт', s.paired ? 'unpair' : 'pair', 'link'),
        ) +
        (s.paired ? '<p class="statusline">Личный чат подключён</p>' : ''),
    ) +
    '</div>'
  );
}
export function settings(s, c) {
  const a = s.settings;
  return (
    heading(
      'Настройки',
      btn('Пошаговая настройка', 'setup', 'sliders-horizontal') + btn('Экскурсия', 'tour', 'compass'),
    ) +
    '<input class="control" id="prefsQuery" placeholder="Найти настройку" aria-label="Поиск настроек">' +
    '<div class="grid">' +
    box(
      'Язык и инструменты',
      'settings',
      select(
        'Язык интерфейса',
        'uiLanguage',
        [
          ['ru', 'Русский'],
          ['en', 'English'],
        ],
        a.language,
      ) +
        acts(
          btn('Размещение и форма виджетов', 'widgetShapes', 'layout-dashboard') +
            btn('Предпросмотр и очистка кэша', 'cachePreview', 'trash-2'),
        ),
    ) +
    box(
      'Обновления приложения',
      'refresh-cw',
      '<p>Текущая версия ' + esc(s.version) + '</p>' +
        (c.updateStatus ? '<p role="status">' + esc(c.updateStatus) + '</p>' : '') +
        acts(btn('Проверить обновления', 'checkUpdate', 'refresh-cw') +
          (c.updateBuild && s.platform === 'win32' && !c.updateRunning
            ? btn('Обновить до ' + c.updateBuild.version, 'installUpdate', 'download', 'primary')
            : '')),
    ) +
    box(
      'Остров на экране',
      'monitor',
      btn('Сохранить снимок экрана', 'screenshot', 'monitor') +
        onOff('Показывать остров', 'island', a.island) +
        onOff('Закрепить поверх окон', 'islandPin', a.islandPin) +
        onOff('Исключать окна Миры из захвата экрана', 'hideCapture', a.hideCapture),
    ) +
    box(
      'При запуске',
      'play',
      (s.platform === 'win32'
        ? onOff('Запуск при входе в Windows', 'startLogin', a.startLogin) +
          onOff('При входе сворачивать в трей', 'startHidden', a.startHidden)
        : '') +
        onOff('Ждать обращения при запуске', 'startListening', a.startListening) +
        onOff('Пузыри сообщений ИИ', 'bubbles', a.bubbles),
    ) +
    box(
      'Уведомления',
      'bell',
      select(
        'Напоминания и команды',
        'quiet',
        [
          ['off', 'Показывать в Windows и в Мире'],
          ['on', 'Только в окне Миры'],
        ],
        a.quiet ? 'on' : 'off',
      ),
    ) +
    box(
      'Память Миры',
      'notebook-pen',
      s.notes
        .filter((n) => n.remember)
        .map(
          (n) =>
            '<div class="entry"><span>' +
            esc(n.text) +
            '</span>' +
            rowAction('remove-notes', n.id, 'x', 'Забыть') +
            '</div>',
        )
        .join('') || '<p class="muted">Скажи «Запомни …», чтобы Мира учитывала это в будущих разговорах.</p>',
    ) +
    box(
      'Оформление',
      'palette',
      backgroundControls() +
        '<div class="swatches">' +
        themeList
          .map(
            ([id, label]) =>
              '<button class="swatch" data-theme-id="' +
              id +
              '" data-act="pickTheme" data-id="' +
              id +
              '" aria-pressed="' +
              (a.theme === id) +
              '"><i></i>' +
              label +
              '</button>',
          )
          .join('') +
        '</div>' +
        (a.theme === 'custom'
          ? field('Цвет фона', 'customColor', a.customColor || defaultCustomColor, 'color')
          : '') +
        field('Акцентный цвет', 'accent', a.accent || '#6b485c', 'color') +
        acts(btn('Цвет темы', 'resetAccent', 'rotate-ccw')) +
        '<label class="field">Свечение фона<input id="glow" type="range" min="0" max="100" value="' +
        (a.glow ?? 55) +
        '"></label>' +
        select(
          'Поверхность панелей',
          'glass',
          [
            ['off', 'Матовая'],
            ['on', 'Стекло'],
          ],
          a.glass ? 'on' : 'off',
        ) +
        onOff('Отключить размытие', 'disableBlur', a.disableBlur) +
        onOff('Подложка под кнопками окна', 'windowButtonBackground', a.windowButtonBackground) +
        onOff('Сворачивать в трей при закрытии', 'minimizeToTray', a.minimizeToTray) +
        select(
          'Частота анимации',
          'fps',
          [
            [30, '30 кадров/с'],
            [60, '60 кадров/с'],
            [120, '120 кадров/с'],
            [240, '240 кадров/с'],
          ],
          a.fps,
        ) +
        select(
          'Уменьшение движения',
          'reduced',
          [
            ['off', 'Выключено'],
            ['on', 'Включено'],
          ],
          a.reduced ? 'on' : 'off',
        ),
    ) +
    box(
      'Персонализация',
      'user-round',
      field('Имя компаньона', 'name', a.name) +
        field('Как тебя называть', 'user', a.user) +
        field('Город для прогноза', 'city', a.city) +
        acts(btn('Сохранить', 'saveProfile', 'save', 'primary')),
    ) +
    box(
      'Управление',
      'keyboard',
      field('Включить или завершить разговор', 'hotkey', a.hotkey) +
        acts(
          btn('Сохранить сочетание', 'hotkey', 'save'),
          btn(s.overlay ? 'Скрыть персонажа' : 'Поверх окон', 'overlay', 'pin'),
        ),
    ) +
    box(
      'Файлы и программы',
      'folder-open',
      (s.files.length
        ? s.files
            .map(
              (f) =>
                '<div class="entry"><span>' +
                esc(f.name) +
                '</span>' +
                rowAction('openFile', f.id, 'external-link', 'Открыть') +
                rowAction('remove-files', f.id, 'x', 'Убрать') +
                '</div>',
            )
            .join('')
        : empty('Добавь программу для команды или папку для поиска.')) +
        acts(
          btn('Добавить файл', 'linkFile', 'plus'),
          btn('Папка для поиска', 'linkFolder', 'folder-open'),
          btn('Перестроить индекс', 'reindex', 'refresh-cw'),
          btn('Исключить папку', 'excludeDir', 'folder-open'),
          ...(s.excludedDirs || []).map((x) => btn('Вернуть ' + x.name, 'excludeDir', 'x', '', x.id)),
          s.indexStatus
            ? '<p>' +
                s.indexStatus.count +
                ' файлов · ' +
                esc(timeLabel(s.indexStatus.time)) +
                (s.indexStatus.limited ? ' · достигнут лимит индекса' : '') +
                '</p>'
            : '',
          btn('Найти файл', 'find', 'search'),
        ),
    ) +
    '</div>'
  );
}
