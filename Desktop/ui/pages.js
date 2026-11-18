import { $, esc, ico, opt, btn, box, field, select, timerTime, timeLabel } from './shared.js';
export const names = {
  home: 'Главная',
  desk: 'Рабочий стол',
  commands: 'Команды',
  model: 'Модель',
  voice: 'Голос',
  ai: 'ИИ',
  plugins: 'Плагины',
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
export const themeList = [
  ['cream', 'Кремовая'],
  ['night', 'Ночная'],
  ['sage', 'Шалфей'],
  ['rose', 'Сакура'],
  ['graphite', 'Графит'],
  ['coal', 'Уголь'],
  ['mist', 'Дымка'],
  ['system', 'Как в системе'],
];
export const kinds = {
  say: 'Произнести текст',
  note: 'Записать заметку',
  task: 'Добавить задачу',
  focus: 'Запустить фокус, мин',
  wait: 'Подождать, сек',
  url: 'Открыть сайт',
  file: 'Открыть файл или программу',
  search: 'Поиск в интернете',
  dance: 'Потанцевать',
  notify: 'Уведомление',
  theme: 'Сменить тему',
  ifTime: 'Условие по времени',
  switchTheme: 'Условие по теме',
  repeat: 'Повторить блоки',
  paste: 'Вставить текст в активное окно',
  keys: 'Нажать сочетание клавиш',
  music: 'Включить музыку',
};
const commandsIcon = {
  ifTime: 'clock-3',
  repeat: 'rotate-ccw',
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
    ? '<br><small>' + esc(timeLabel(s.time)) + (s.fired ? ' · завершено' : '') + '</small>'
    : '') +
  '</span>' +
  rowAction('remove-' + kind, s.id, 'x', 'Удалить') +
  '</div>';
const listBox = (s, kind, label, icon, placeholder) =>
  box(
    label,
    icon,
    (s[kind].length ? s[kind].map((i) => entry(i, kind)).join('') : empty(placeholder)) +
      acts(btn('Добавить', 'add-' + kind, 'plus')),
  );
export function desk(s, c) {
  const w = c.weather,
    r = c.rates,
    sys = c.sys;
  const music =
    '<div id="musicSlot"></div>' +
    acts(btn(s.music ? 'Сменить дорожку' : 'Выбрать дорожку', 'music', 'folder-open'));
  return (
    heading('Рабочий стол', btn('Найти файл', 'find', 'search')) +
    '<div class="grid">' +
    box(
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
    ) +
    listBox(s, 'tasks', 'Задачи', 'list-checks', 'Здесь появятся твои задачи.') +
    listBox(s, 'notes', 'Заметки', 'notebook-pen', 'Заметку можно надиктовать или записать здесь.') +
    listBox(s, 'events', 'Календарь', 'calendar-days', 'Напоминаний пока нет.') +
    box(
      'Погода',
      'cloud-sun',
      w
        ? '<div class="clock">' +
            Math.round(w.temp) +
            '°</div><p>' +
            esc(w.city) +
            '</p><p class="muted">Максимум на три дня · ' +
            w.days.map((n) => Math.round(n) + '°').join(' / ') +
            '</p>' +
            acts(btn('Обновить', 'weather', 'refresh-cw'))
        : '<p>' + esc(s.settings.city) + '</p>' + acts(btn('Узнать погоду', 'weather', 'cloud-sun')),
    ) +
    box(
      'Курсы валют',
      'banknote',
      (r
        ? '<p>USD · ' +
          r.USD.toFixed(2) +
          ' ₽ &nbsp; EUR · ' +
          r.EUR.toFixed(2) +
          ' ₽</p><p class="muted">' +
          esc(timeLabel(r.date)) +
          ' · ЦБ РФ</p>'
        : '') + acts(btn('Получить курсы', 'rates', 'refresh-cw')),
    ) +
    box('Плеер', 'music-2', music) +
    box(
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
    ) +
    '</div>'
  );
}
export function newRoutine() {
  return { name: 'Новая команда', phrase: '', hotkey: '', blocks: [{ kind: 'say', value: 'Привет!' }] };
}
export function commands(s, c) {
  const d = c.draft,
    list = s.routines;
  const side =
    '<div class="box flowSide"><h3>Мои команды</h3>' +
    list
      .map((x) =>
        btn(
          x.name,
          'edit',
          d?.id === x.id ? 'circle-dot' : 'workflow',
          d?.id === x.id ? 'selected' : '',
          x.id,
        ),
      )
      .join('') +
    btn('Новая команда', 'newRoutine', 'plus') +
    btn('Импорт JSON', 'importPack', 'upload') +
    '</div>';
  if (!d)
    return (
      heading('Команды') +
      '<div class="workflow">' +
      side +
      box(
        'Сценарии',
        'workflow',
        empty('Выбери команду или собери свою из блоков.') +
          acts(
            btn('Создать команду', 'newRoutine', 'plus', 'primary'),
            btn('Мастерская', 'workshop', 'library'),
          ),
      ) +
      '</div>'
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
    wires.push(
      '<path class="' +
        (alt ? 'alt' : '') +
        '" d="M ' +
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
        endY +
        '"/>',
    );
  };
  edge(204, 72, pos[0]);
  for (const [i, n] of d.blocks.entries()) {
    const p = pos[i],
      branch = ['ifTime', 'switchTheme', 'repeat'].includes(n.kind);
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
        'px" data-node="' +
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
    let value = field('Значение', 'nodeValue', b.value);
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
    if (['dance', 'music'].includes(b.kind)) value = '';
    if (b.kind === 'ifTime') value = field('Диапазон часов · 09-18', 'nodeValue', b.value);
    const ends = d.blocks
      .map((n, j) => [j, j + 1 + ' · ' + kinds[n.kind]])
      .concat([[d.blocks.length, 'Завершить']]);
    const branch = ['repeat', 'ifTime', 'switchTheme'].includes(b.kind);
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
      (branch
        ? select(b.kind === 'repeat' ? 'Повторять с' : 'Нет', 'nodeAlt', ends, b.alternate ?? 0)
        : '') +
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
    heading(
      'Редактор команд',
      acts(btn('Запустить', 'runRoutine', 'play'), btn('Сохранить', 'saveRoutine', 'save', 'primary')),
    ) +
    '<div class="workflow">' +
    side +
    '<article class="editPanel">' +
    field('Название', 'rName', d.name) +
    '<div class="grid">' +
    field('Голосовая фраза', 'rPhrase', d.phrase) +
    field('Горячая клавиша', 'rHotkey', d.hotkey) +
    '</div><div class="flowTools"><select class="control" id="kind">' +
    Object.entries(kinds)
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
export function model(s, c) {
  const a = s.settings;
  return (
    heading('Персонаж') +
    '<div class="stack modelOptions">' +
    box(
      'Внешность',
      'user-round',
      select(
        'Модель или комплект одежды',
        'avatarPick',
        [['vita', 'Вита'], ...s.avatars.map((x) => [x.id, x.name])],
        a.avatar,
      ) +
        acts(
          btn('Импорт VRM', 'avatar', 'upload'),
          btn(a.showAvatar ? 'Скрыть на главной' : 'Показать на главной', 'showAvatar', 'user-round'),
        ),
    ) +
    box(
      'Движения и эмоции',
      'orbit',
      select(
        'Движение',
        'gesture',
        [['auto', 'По ситуации'], ...(c.catalog?.clips || []).map((x) => [x.id, x.title])],
        c.gesture,
      ) +
        select(
          'Эмоция',
          'emotion',
          [['', 'По ситуации'], ...(c.catalog?.emotions || []).map((e) => [e.id, e.title])],
          c.emotion,
        ) +
        acts(btn('Повторить', 'replay', 'play'), btn('Потанцевать', 'dance', 'music-2')),
    ) +
    box(
      'Рабочий стол',
      'monitor',
      acts(
        btn(s.overlay ? 'Убрать с рабочего стола' : 'Поверх окон', 'overlay', 'pin'),
        btn(s.seated ? 'Встать' : 'Сесть на край окна', 'seat', 'pin'),
        btn('Настроить частоту', 'settings', 'sliders-horizontal'),
      ),
    ) +
    box(
      'Игры и VMC',
      'monitor',
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
        ) +
        '<p class="muted" id="frameMeter" aria-live="off"></p>',
    ) +
    '</div>'
  );
}
export function voice(s, c) {
  const a = s.settings;
  return (
    heading('Голос') +
    '<div class="grid">' +
    box(
      'Разговор',
      'mic',
      '<p class="muted">Мира слушает до паузы, отвечает вслух и снова включает микрофон. Русская речь распознаётся на этом компьютере.</p>' +
        acts(btn('Начать разговор', 'voice', 'mic', 'primary')),
    ) +
    box(
      'Озвучивание',
      'volume-2',
      select(
        'Голос',
        'voicePick',
        [
          ['builtin', 'Руслан · локальный'],
          ['system', 'Голос Windows'],
          ['fish', 'Fish Audio · облако'],
          ...s.voices.map((v) => [v.id, v.name]),
        ],
        a.voice,
      ) +
        (a.voice === 'system'
          ? select(
              'Установленные голоса',
              'sysVoice',
              [['', 'По умолчанию'], ...(c.sysVoices || []).map((v) => [v, v])],
              a.systemVoice,
            )
          : '') +
        acts(btn('Послушать пример', 'audition', 'play'), btn('Импорт .onnx', 'voiceFile', 'upload')),
    ) +
    box(
      'Fish Audio',
      'cloud-sun',
      field(
        s.keys.includes('fish') ? 'Ключ сохранён · заменить' : 'Ключ доступа',
        'fishKey',
        '',
        'password',
      ) +
        acts(btn('Сохранить ключ', 'keyFish', 'save')) +
        field('Поиск по библиотеке', 'fishQuery', c.fishQuery || '') +
        acts(btn('Найти голоса', 'fishSearch', 'search')) +
        (c.fishList || [])
          .map(
            (v) =>
              '<div class="entry"><span>' +
              esc(v.title) +
              '</span>' +
              btn(a.fishVoice === v.id ? 'Выбран' : 'Выбрать', 'fishPick', '', '', v.id) +
              '</div>',
          )
          .join('') +
        (c.fishList?.length ? acts(btn('Следующая страница', 'fishNext', 'chevron-right')) : ''),
    ) +
    '</div>'
  );
}
export const providerPresets = [
  ['https://api.openai.com/v1', 'OpenAI'],
  ['https://openrouter.ai/api/v1', 'OpenRouter'],
  ['https://api.deepseek.com/v1', 'DeepSeek'],
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
    heading('Искусственный интеллект') +
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
            field(
              s.keys.includes('ai') ? 'API-ключ сохранён · заменить' : 'API-ключ',
              'aiKey',
              '',
              'password',
            ) +
            acts(btn('Сохранить подключение', 'saveAI', 'save', 'primary'))
          : '<p class="muted">Вес модели скачивается на ПК один раз. Для запуска используется встроенный llama.cpp.</p>') +
        '<hr>' +
        field('Роль собеседника', 'role', a.role) +
        acts(btn('Сохранить роль', 'saveRole', 'save')),
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
          ' ГБ ОЗУ</p></div>' +
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
    heading('Настройки') +
    '<div class="grid">' +
    box(
      'Оформление',
      'palette',
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
          btn('Найти файл', 'find', 'search'),
        ),
    ) +
    '</div>'
  );
}
