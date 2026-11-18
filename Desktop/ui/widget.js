import { $, esc, timerTime, timeLabel } from './shared.js';
const call = (op, task) => window.desk.call('screenAction', { op, task });
const names = { focus: 'Фокус', tasks: 'Задачи', events: 'Календарь', notes: 'Заметки' };
let state,
  seq = 0;
async function draw() {
  const n = ++seq,
    s = await call('state');
  if (seq !== n) return;
  state = s;
  document.body.toggleAttribute(
    'data-dark',
    ['graphite', 'coal', 'night'].includes(s.theme) ||
      (s.theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches),
  );
  $('b').textContent = names[s.id];
  $('#pin').setAttribute('aria-pressed', String(s.pinned));
  document.title = names[s.id] + ' · Мира';
  $('main').innerHTML = s.focus
    ? '<strong>' +
      timerTime(s.focus) +
      '</strong> <button id="focus">' +
      (s.focus.ends ? 'Пауза' : 'Старт') +
      '</button>'
    : s.items
        .map(
          (x) =>
            '<p>' +
            (s.id === 'tasks'
              ? '<button data-task="' + esc(x.id) + '" aria-label="Отметить выполненной">○</button>'
              : '') +
            (x.time ? esc(timeLabel(x.time)) + ' · ' : '') +
            esc(x.text) +
            '</p>',
        )
        .join('') || '<p>Пока пусто</p>';
}
document.onclick = async (e) => {
  const b = e.target.closest('button');
  if (b)
    try {
      await call(b.dataset.task ? 'done' : b.id, b.dataset.task);
    } catch (err) {
      $('main').textContent = err.message;
    }
};
window.desk.on((e) => {
  if (e.type === 'widget') draw();
});
setInterval(() => {
  if (state?.focus && $('strong')) $('strong').textContent = timerTime(state.focus);
}, 500);
draw();
