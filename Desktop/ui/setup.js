import { $, esc, field, select, ico, call } from './shared.js';
import { themeList } from './pages.js';

const choice = (label, id, list, current) => select(label, id, list, current);
const toggle = (label, id, on) =>
  choice(
    label,
    id,
    [
      ['off', 'Выключено'],
      ['on', 'Включено'],
    ],
    on ? 'on' : 'off',
  );
export function openSetup(state, finished) {
  const dialog = $('#intro');
  if (dialog.open) return;
  const data = { ...state.settings },
    changed = {},
    short = ['welcome', 'mode', 'speech', 'ai', 'avatar', 'theme', 'done'];
  let step = 0,
    quick = false,
    busy = false,
    steps = [];
  const pages = [
    [
      'welcome',
      'Привет, я Мира',
      'Я могу говорить с тобой и жить на рабочем столе.',
      () => '<p class="setupLanguage">Русский</p>',
    ],
    [
      'mode',
      'Как будем меня настраивать?',
      'Выбери, сколько настроек пройти сейчас.',
      () =>
        '<div class="setupChoices">' +
        [
          ['quick', 'Быстрая настройка', 'Голос, ИИ и внешний вид.'],
          ['full', 'Подробная настройка', 'Обращение, характер, виджеты и запуск.'],
        ]
          .map(
            ([id, title, n]) =>
              '<button type="button" data-setup-mode="' +
              id +
              '" aria-pressed="' +
              (quick === (id === 'quick')) +
              '"><strong>' +
              title +
              '</strong><span>' +
              n +
              '</span></button>',
          )
          .join('') +
        '</div>',
    ],
    [
      'speech',
      'Настройка звука',
      'Выбери, сколько ждать паузы, прежде чем ответить.',
      () =>
        choice(
          'Пауза в конце фразы',
          'silence',
          [
            [0.5, 'Короткая'],
            [0.78, 'Обычная'],
            [1.25, 'Длинная'],
            [data.silence, 'Текущее значение · ' + data.silence + ' с'],
          ].filter((r, i, a) => a.findIndex((x) => x[0] === r[0]) === i),
          data.silence,
        ),
    ],
    [
      'wake',
      'Слово-активатор',
      'Мира откликается на имя, когда включён режим ожидания обращения.',
      () =>
        field('Как меня звать', 'wakeAlias', data.wakeAlias || '') +
        toggle('Ждать обращения при запуске', 'startListening', data.startListening),
    ],
    [
      'voice',
      'Настройка голоса',
      'Эти параметры применяются к голосовым ответам.',
      () =>
        choice(
          'Скорость речи',
          'speechRate',
          [
            [0.8, 'Медленнее'],
            [1, 'Обычная'],
            [1.2, 'Быстрее'],
            [data.speechRate, 'Текущая · ' + data.speechRate],
          ].filter((r, i, a) => a.findIndex((x) => x[0] === r[0]) === i),
          data.speechRate,
        ),
    ],
    [
      'ai',
      'Искусственный интеллект',
      'Локальную модель можно выбрать и скачать во вкладке «ИИ».',
      () =>
        choice(
          'Источник ответов',
          'provider',
          [
            ['local', 'Модель на компьютере'],
            ['endpoint', 'Совместимый сервис'],
          ],
          data.provider,
        ) +
        (data.provider === 'local'
          ? choice(
              'Модель',
              'model',
              state.models.map((m) => [m.id, m.name + ' · ' + m.quant]),
              data.model,
            )
          : field('Адрес API', 'base', data.base) + field('Название модели', 'cloudModel', data.cloudModel)),
    ],
    [
      'avatar',
      'Аватар',
      'Вита доступна во вкладке «Модель» и в отдельном окне поверх рабочего стола.',
      () =>
        toggle('Вита рядом с чатом', 'showAvatar', data.showAvatar) +
        choice(
          'Целевая частота кадров',
          'fps',
          [30, 60, 120, 240].map((n) => [n, n + ' кадр/с']),
          data.fps,
        ),
    ],
    [
      'profile',
      'Персонализация',
      'Так будет выглядеть приветствие на главном экране.',
      () => field('Как к тебе обращаться', 'user', data.user) + field('Имя ассистента', 'name', data.name),
    ],
    [
      'character',
      'Личность',
      'Опиши, как Мира должна отвечать.',
      () =>
        '<label class="field">Инструкция<textarea id="role" maxlength="2500">' +
        esc(data.role) +
        '</textarea></label>',
    ],
    [
      'widgets',
      'Виджеты',
      'Выбери карточки рабочего стола.',
      () =>
        '<div class="setupChecks">' +
        data.widgets
          .map(
            (w) =>
              '<label><input type="checkbox" data-widget-choice="' +
              esc(w.id) +
              '" ' +
              (w.visible ? 'checked' : '') +
              '> ' +
              esc(state.widgetNames[w.id]) +
              '</label>',
          )
          .join('') +
        '</div>',
    ],
    [
      'overlay',
      'Остров',
      'В отдельной капсуле доступны разговор, полка файлов и виджеты.',
      () =>
        toggle('Показывать остров', 'island', data.island) +
        toggle('Поверх окон', 'islandPin', data.islandPin),
    ],
    [
      'theme',
      'Внешний вид',
      'Выбери тему для главного экрана и панелей.',
      () => choice('Тема', 'theme', themeList, data.theme) + toggle('Стекло', 'glass', data.glass),
    ],
    [
      'done',
      'Всё готово!',
      'Настройки можно изменить в любое время.',
      () =>
        '<div class="setupSummary"><strong>' +
        esc(data.name) +
        '</strong><span>' +
        esc(themeList.find((t) => t[0] === data.theme)?.[1]) +
        ' · ' +
        (data.provider === 'local' ? 'Локальный ИИ' : 'Сервис ИИ') +
        '</span></div>',
    ],
  ];
  const list = () => (quick ? pages.filter(([id]) => short.includes(id)) : pages);
  function draw() {
    steps = list();
    const [id, title, n, body] = steps[step];
    $('#intro').dataset.step = id;
    $('#introTitle').textContent = title;
    $('#introInfo').textContent = n;
    $('#introFields').innerHTML = body();
    $('#introBack').hidden = step === 0;
    $('#introNext').textContent = id === 'done' ? 'Завершить' : 'Далее';
    $('#introProgress').innerHTML = steps
      .map((_, i) => '<i class="' + (i === step ? 'current' : '') + '"></i>')
      .join('');
    $('#introProgress').setAttribute('aria-label', 'Шаг ' + (step + 1) + ' из ' + steps.length);
  }
  function capture() {
    for (const el of $('#introFields').querySelectorAll('input[id],select[id],textarea[id]')) {
      const k = el.id;
      let v = el.value;
      if (typeof data[k] === 'boolean') v = v === 'on';
      if (typeof data[k] === 'number') v = Number(v);
      if (v !== data[k]) {
        data[k] = v;
        changed[k] = v;
      }
    }
    const checks = [...$('#introFields').querySelectorAll('[data-widget-choice]')];
    if (checks.length) {
      const next = data.widgets.map((w, i) => ({ ...w, visible: checks[i].checked }));
      if (next.some((w, i) => w.visible !== data.widgets[i].visible)) {
        data.widgets = next;
        changed.widgets = next;
      }
    }
  }
  async function close(apply) {
    if (busy) return;
    busy = true;
    $('#introNext').disabled = true;
    try {
      if (apply) capture();
      await call('settings', { ...(apply ? changed : {}), introDone: true });
      dialog.close();
      await finished();
    } catch (e) {
      $('#introError').textContent = e.message;
    } finally {
      busy = false;
      $('#introNext').disabled = false;
    }
  }
  $('#introBack').onclick = () => {
    if (step) {
      capture();
      step--;
      draw();
    }
  };
  $('#introNext').onclick = () => {
    if (busy) return;
    if (step === steps.length - 1) {
      close(true);
      return;
    }
    capture();
    step++;
    draw();
  };
  $('#introSkip').onclick = () => close(false);
  dialog.oncancel = (e) => {
    e.preventDefault();
    close(false);
  };
  $('#introFields').onclick = (e) => {
    const b = e.target.closest('[data-setup-mode]');
    if (b) {
      quick = b.dataset.setupMode === 'quick';
      draw();
    }
  };
  $('#introFields').onchange = (e) => {
    e.stopPropagation();
    if (e.target.id === 'provider') {
      capture();
      draw();
    }
  };
  $('#introError').textContent = '';
  $('#introMark').innerHTML = ico('sparkles');
  draw();
  dialog.showModal();
}
