import { $, call, esc, field, select, toast, reportError } from './shared.js';
const button = (label, op, id = '') =>
  '<button type="button" class="btn" data-extra="' +
  op +
  '" data-id="' +
  esc(id) +
  '">' +
  esc(label) +
  '</button>';
const roles = [
  ['research', 'Исследователь'],
  ['writer', 'Редактор'],
  ['analyst', 'Аналитик'],
  ['image', 'Изображение'],
];
const states = {
  queued: 'В очереди',
  running: 'В работе',
  cancelled: 'Отменено',
  interrupted: 'Прервано при выходе',
  done: 'Готово',
  error: 'Ошибка',
};
const widgets = [
  ['focus', 'Фокус'],
  ['tasks', 'Задачи'],
  ['notes', 'Заметки'],
  ['events', 'Календарь'],
];
function fileSize(bytes) {
  const divisor = bytes >= 1048576 ? 1048576 : bytes >= 1024 ? 1024 : 1;
  return (
    (bytes / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
    ' ' +
    { 1: 'B', 1024: 'KiB', 1048576: 'MiB' }[divisor]
  );
}
export function desktopTools(modal, getState) {
  let plan,
    groups = new Set(),
    page = 0,
    project,
    widgetId = 'focus',
    seq = 0;
  const host = $('#modalBody');
  async function jobs() {
    const generation = ++seq,
      jobs = await call('assistantList');
    if (generation !== seq || !$('#jobList')) return;
    $('#jobList').innerHTML =
      jobs
        .map(
          (j) =>
            '<article class="extraJob"><b>' +
            esc(roles.find(([id]) => id === j.role)?.[1]) +
            ' · ' +
            esc(states[j.status]) +
            '</b><p>' +
            esc(j.prompt) +
            '</p>' +
            (['queued', 'running'].includes(j.status)
              ? button('Отменить', 'cancelJob', j.id)
              : ['error', 'cancelled', 'interrupted'].includes(j.status)
                ? button('Повторить задание', 'retryJob', j.id)
                : '') +
            (j.status === 'done' && j.role === 'image'
              ? '<img class="generatedImage" alt="Сгенерированное изображение" src="/generated/' +
                esc(j.id) +
                '.png">' +
                button('Сохранить PNG', 'saveImage', j.id)
              : j.result
                ? '<pre>' + esc(j.result) + '</pre>'
                : '') +
            (j.error ? '<p role="alert">' + esc(j.error) + '</p>' : '') +
            '</article>',
        )
        .join('') || '<p>Заданий пока нет.</p>';
  }
  async function assistants() {
    modal(
      'Фоновые помощники',
      select('Помощник', 'assistantRole', roles, 'research') +
        '<label class="field">Задание<textarea id="jobPrompt" maxlength="12000"></textarea></label>' +
        button('Запустить в фоне', 'startJob') +
        '<details><summary>Подключение генератора изображений</summary><p>Изображения создаёт OpenAI. Текстовые помощники используют выбранную модель чата.</p>' +
        field(
          getState().keys.includes('images') ? 'Заменить ключ OpenAI Images' : 'Ключ OpenAI Images',
          'imageKey',
          '',
          'password',
        ) +
        button('Сохранить ключ', 'imageKey') +
        '</details><section id="jobList" aria-live="polite"></section>',
    );
    await jobs();
  }
  function cache() {
    const files = plan.files,
      totals = new Map();
    for (const f of files) totals.set(f.id, (totals.get(f.id) || 0) + f.size);
    const selected = files.filter((f) => groups.has(f.id)),
      pages = Math.max(1, Math.ceil(selected.length / 50));
    page = Math.min(page, pages - 1);
    modal(
      'Предварительный просмотр кэшей',
      '<p>Кэши Миры. На Windows также доступны кэши DirectX и установленных браузеров. Выбери категории для удаления.</p>' +
        (totals.size
          ? button('Выбрать все', 'allCache') + button('Снять выбор', 'noCache')
          : '<p>Файлов кэша не найдено.</p>') +
        [...totals]
          .map(
            ([id, bytes]) =>
              '<label class="cacheCategory"><input type="checkbox" data-cache="' +
              esc(id) +
              '" ' +
              (groups.has(id) ? 'checked' : '') +
              '> ' +
              esc(id) +
              ' · ' +
              fileSize(bytes) +
              '</label>',
          )
          .join('') +
        '<p>' +
        selected.length +
        ' · ' +
        fileSize(selected.reduce((s, f) => s + f.size, 0)) +
        '</p><ol class="cacheFiles">' +
        selected
          .slice(page * 50, page * 50 + 50)
          .map((f) => '<li>' + esc(f.id + '/' + f.name) + ' · ' + fileSize(f.size) + '</li>')
          .join('') +
        '</ol>' +
        (pages > 1
          ? button('Назад', 'prevCache') +
            ' ' +
            (page + 1) +
            ' / ' +
            pages +
            ' ' +
            button('Далее', 'nextCache')
          : '') +
        (plan.unreadable ? '<p>Недоступные папки или файлы: ' + plan.unreadable + '</p>' : '') +
        button('Обновить список', 'scanCache') +
        (selected.length ? button('Удалить выбранные файлы', 'removeCache') : ''),
    );
  }
  async function scan() {
    const value = await call('cachePreview');
    plan = value;
    groups = new Set(value.files.filter((f) => !f.id.includes(' / ') && f.id !== 'DirectX').map((f) => f.id));
    page = 0;
    cache();
  }
  async function git(id) {
    project = id;
    const info = await call('gitBranches', { id, op: 'list' });
    modal(
      'Ветки Git',
      '<p>' +
        esc(info.current || 'HEAD') +
        ' · ' +
        (info.dirty ? 'Есть изменения в рабочей папке' : 'Рабочая папка чиста') +
        '</p>' +
        select(
          'Локальная ветка',
          'gitBranch',
          info.branches.map((n) => [n, n]),
          info.current,
        ) +
        button('Переключиться', 'gitSwitch') +
        field('Новая ветка', 'gitName', '') +
        button('Создать и переключиться', 'gitCreate'),
    );
  }
  async function shape(id = widgetId) {
    widgetId = id;
    const state = await call('state'),
      opt = state.screenWidgets?.[id];
    modal(
      'Размещение виджетов',
      select('Виджет', 'shapeWidget', widgets, id) +
        select(
          'Размещение',
          'shapeMode',
          [
            ['off', 'Выключен'],
            ['window', 'Отдельное окно'],
            ['pin', 'Поверх окон'],
            ...(state.platform === 'win32' ? [['wallpaper', 'На слое обоев Windows']] : []),
          ],
          opt ? (opt.wallpaper ? 'wallpaper' : opt.pin ? 'pin' : 'window') : 'off',
        ) +
        '<p>Нажимай на поле по контуру фигуры или введи координаты от 0 до 100. Пустой контур даёт прямоугольник.</p><canvas id="shapeCanvas" width="260" height="140" aria-label="Контур виджета"></canvas>' +
        field('Точки контура', 'shapePoints', opt?.shape || '') +
        button('Сбросить контур', 'resetShape') +
        button('Применить', 'saveShape'),
    );
    const canvas = $('#shapeCanvas'),
      input = $('#shapePoints');
    function draw() {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 260, 140);
      ctx.beginPath();
      const pts = input.value
        .trim()
        .split(/\s+/)
        .map((p) => p.split(',').map(Number))
        .filter((p) => p.length === 2 && p.every(Number.isFinite));
      pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x * 2.6, y * 1.4));
      ctx.closePath();
      ctx.fillStyle = '#9984ab77';
      ctx.fill();
      ctx.strokeStyle = '#806b91';
      ctx.stroke();
      for (const [x, y] of pts) ctx.fillRect(x * 2.6 - 2, y * 1.4 - 2, 4, 4);
    }
    canvas.onpointerdown = (e) => {
      const r = canvas.getBoundingClientRect();
      input.value = (
        input.value +
        ' ' +
        Math.round((100 * (e.clientX - r.left)) / r.width) +
        ',' +
        Math.round((100 * (e.clientY - r.top)) / r.height)
      ).trim();
      draw();
    };
    input.oninput = draw;
    draw();
  }
  host.addEventListener('change', (e) => {
    if (e.target.id === 'shapeWidget') shape(e.target.value).catch(reportError);
    if (e.target.dataset.cache !== undefined) {
      if (e.target.checked) groups.add(e.target.dataset.cache);
      else groups.delete(e.target.dataset.cache);
      page = 0;
      cache();
    }
  });
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-extra]');
    if (!b) return;
    b.disabled = true;
    try {
      switch (b.dataset.extra) {
        case 'imageKey':
          await call('key', { name: 'images', value: $('#imageKey').value });
          $('#imageKey').value = '';
          toast('Ключ сохранён');
          break;
        case 'startJob':
          await call('assistantStart', { role: $('#assistantRole').value, prompt: $('#jobPrompt').value });
          $('#jobPrompt').value = '';
          await jobs();
          break;
        case 'retryJob': {
          const job = (await call('assistantList')).find((j) => j.id === b.dataset.id);
          if (job) await call('assistantStart', { role: job.role, prompt: job.prompt });
          await jobs();
          break;
        }
        case 'cancelJob':
          await call('assistantCancel', { id: b.dataset.id });
          await jobs();
          break;
        case 'saveImage':
          await call('saveGenerated', { id: b.dataset.id });
          break;
        case 'scanCache':
          await scan();
          break;
        case 'allCache':
          groups = new Set(plan.files.map((f) => f.id));
          page = 0;
          cache();
          break;
        case 'noCache':
          groups.clear();
          page = 0;
          cache();
          break;
        case 'prevCache':
          page = Math.max(0, page - 1);
          cache();
          break;
        case 'nextCache':
          page++;
          cache();
          break;
        case 'removeCache': {
          const r = await call('cacheRemove', { token: plan.token, groups: [...groups] });
          modal(
            'Очистка завершена',
            '<p>' +
              fileSize(r.bytes) +
              ' · ' +
              r.files +
              ' · ' +
              'Пропущено: ' +
              r.skipped +
              '</p>' +
              button('Проверить снова', 'scanCache'),
          );
          break;
        }
        case 'gitSwitch':
        case 'gitCreate': {
          const create = b.dataset.extra === 'gitCreate';
          await call('gitBranches', {
            id: project,
            op: create ? 'create' : 'switch',
            name: $(create ? '#gitName' : '#gitBranch').value,
          });
          await git(project);
          break;
        }
        case 'resetShape':
          $('#shapePoints').value = '';
          $('#shapePoints').oninput();
          break;
        case 'saveShape':
          await call('screenWidget', {
            id: widgetId,
            mode: $('#shapeMode').value,
            shape: $('#shapePoints').value,
          });
          toast('Размещение сохранено');
          break;
      }
    } catch (e) {
      let msg = host.querySelector('.extraError');
      if (!msg) {
        msg = document.createElement('p');
        msg.className = 'extraError';
        msg.setAttribute('role', 'alert');
        host.prepend(msg);
      }
      msg.textContent = e.message;
      reportError(e);
    } finally {
      b.disabled = false;
    }
  });
  return { assistants, scan, git, shape, jobs };
}
