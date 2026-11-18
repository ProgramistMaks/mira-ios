import { $, esc } from './shared.js';
const steps = [
  [
    'home',
    '#compose',
    'Чат',
    'Напиши сообщение, приложи файл или снимок экрана. Слэш открывает список команд чата.',
  ],
  [
    'home',
    '#mic',
    'Разговор',
    'Включи микрофон один раз. Мира слушает, ждёт окончания фразы и отвечает голосом. Попробуй сказать «открой браузер гугол».',
  ],
  [
    'home',
    '#historyBtn',
    'История и проекты',
    'Открой историю слева. В проекте можно выбрать рабочую папку, редактировать текст и переключать ветки Git.',
  ],
  [
    'desk',
    '.boardTile',
    'Рабочий стол',
    'Добавляй заметки, задачи и события. Меню справа управляет составом и расположением карточек.',
  ],
  [
    'commands',
    '.commandTabs',
    'Команды',
    'Здесь создаются сценарии из шагов. Сценарий можно запускать фразой, сочетанием клавиш или по расписанию.',
  ],
  [
    'model',
    '.companionBar',
    'Персонаж',
    'Выбери внешний вид, одежду и движения Виты. Включи компаньона, чтобы видеть её поверх других окон.',
  ],
  [
    'voice',
    '.voiceLibrary',
    'Голос',
    'Выбери микрофон и голос, проверь сигнал и настрой паузу. В библиотеке можно искать и прослушивать голоса.',
  ],
  [
    'ai',
    '[data-act="assistants"]',
    'ИИ и помощники',
    'Здесь подключаются провайдеры, скачиваются локальные модели и включается поиск. Помощники выполняют задания в фоне и сохраняют результаты.',
  ],
  [
    'plugins',
    '#content',
    'Мастерская',
    'Устанавливай расширения, подключай инструменты и открывай игровые панели.',
  ],
  [
    'settings',
    '[data-act="widgetShapes"]',
    'Виджеты и остров',
    'Выбери, где появится отдельный виджет, и нарисуй его контур. В настройках острова доступны голос, файловая полка и история буфера.',
  ],
  [
    'settings',
    '[data-act="cachePreview"]',
    'Настройки',
    'Здесь меняются язык и оформление. Перед очисткой кэша можно просмотреть каждый файл. Экскурсию можно запустить повторно.',
  ],
];
export function startTour(nav, origin) {
  document.querySelector('#guidedTour')?.remove();
  const tour = document.createElement('aside');
  tour.id = 'guidedTour';
  tour.setAttribute('aria-label', 'Экскурсия');
  document.body.append(tour);
  let i = 0,
    highlight;
  function end() {
    highlight?.classList.remove('tourTarget');
    tour.remove();
    document.removeEventListener('keydown', escape);
    nav(origin);
  }
  function escape(e) {
    if (e.key === 'Escape') end();
  }
  function draw() {
    highlight?.classList.remove('tourTarget');
    const [page, selector, title, copy] = steps[i];
    nav(page);
    highlight = $(selector);
    highlight?.classList.add('tourTarget');
    highlight?.scrollIntoView({ block: 'nearest' });
    tour.innerHTML =
      '<small>' +
      String(i + 1) +
      ' / ' +
      steps.length +
      '</small><h3>' +
      esc(title) +
      '</h3><p>' +
      esc(copy) +
      '</p><div><button data-tour="close">Закрыть</button>' +
      (i ? '<button data-tour="back">Назад</button>' : '') +
      '<button data-tour="next">' +
      (i + 1 === steps.length ? 'Готово' : 'Далее') +
      '</button></div>';
    tour.querySelector('[data-tour=next]').focus({ preventScroll: true });
  }
  tour.onclick = (e) => {
    const op = e.target.closest('button')?.dataset.tour;
    if (op === 'close' || (op === 'next' && i === steps.length - 1)) end();
    else if (op) {
      i += op === 'back' ? -1 : 1;
      draw();
    }
  };
  document.addEventListener('keydown', escape);
  draw();
}
