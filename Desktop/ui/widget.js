import { rollingNumber, appear, rowChanges, setReduced } from './motion.js';
import { applyPalette } from './themes.mjs';
import { $, esc, timerTime, timeLabel } from './shared.js';
import { widgetBlocks } from './creative.js';
const call = (op, task) => window.desk.call('screenAction', { op, task });
const names = { focus: 'Фокус', tasks: 'Задачи', events: 'Календарь', notes: 'Заметки' };
let state,
  seq = 0;
async function draw() {
  const n = ++seq,
    s = await call('state');
  if (seq !== n) return;
  setReduced(s.reduced);
  if (!state) appear(document.querySelector('main'), { opacity: 0, scale: '.96' }, 200);
  const animate = rowChanges($('main'), 'p[data-motion-id]', s.id);
  state = s;
  applyPalette(document.body, s.theme, s.customColor);
  document.body.toggleAttribute(
    'data-dark',
    ['graphite', 'coal', 'night'].includes(s.theme) ||
      (s.theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches),
  );
  const name=s.custom?.title||names[s.id];
  $('b').textContent = name;
  $('#pin').setAttribute('aria-pressed', String(s.pinned));
  document.title = name + ' · Мира';
  $('main').innerHTML = s.custom ? widgetBlocks(s.custom,[],false,true) : s.focus
    ? '<strong>' +
      timerTime(s.focus) +
      '</strong> <button id="focus">' +
      (s.focus.ends ? 'Пауза' : 'Старт') +
      '</button>'
    : s.items
        .map(
          (x) =>
            '<p data-motion-id="' +
            esc(x.id) +
            '">' +
            (s.id === 'tasks'
              ? '<button data-task="' + esc(x.id) + '" aria-label="Отметить выполненной">○</button>'
              : '') +
            (x.time ? esc(timeLabel(x.time)) + ' · ' : '') +
            esc(x.text) +
            '</p>',
        )
        .join('') || '<p>Пока пусто</p>';
  animate();
}
document.onclick = async (e) => {
  const b = e.target.closest('button');
  if (b)
    try {
      if (b.dataset.screenTask) await call('toggleCustomTask',{blockId:b.dataset.screenBlock,taskId:b.dataset.screenTask});
      else if (b.dataset.act==='openWidgetProject') await call('customProject');
      else await call(b.dataset.task ? 'done' : b.id, b.dataset.task);
    } catch (err) {
      $('main').textContent = err.message;
    }
};
window.desk.on((e) => {
  if (e.type === 'widget') draw();
});
setInterval(() => {
  if (state?.focus && $('strong')) rollingNumber($('strong'), timerTime(state.focus));
}, 500);
draw();
