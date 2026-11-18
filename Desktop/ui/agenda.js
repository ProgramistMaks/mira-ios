import { appear, rowChanges } from './motion.js';
import { $, call, esc, ico, reportError } from './shared.js';
import { calendarStart, localKey, occursOn } from './calendar-dates.mjs';

const dialog = $('#agenda'),
  body = $('#agendaBody');
const monthName = new Intl.DateTimeFormat('ru', { month: 'long' });
const dayName = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });
const weekday = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const timeOf = (d) => [d.getHours(), d.getMinutes()].map((n) => String(n).padStart(2, '0')).join(':');
let mode,
  day,
  month,
  state,
  draft,
  saving = false;
const control = (op, label, icon, id = '') =>
  '<button data-ag="' +
  op +
  '" data-id="' +
  esc(id) +
  '" aria-label="' +
  esc(label) +
  '" title="' +
  esc(label) +
  '">' +
  ico(icon) +
  '</button>';
function calendar() {
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const events = state.events.filter((e) => e.category !== 'reminder');
  const selected = localKey(day),
    today = localKey(new Date());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = localKey(d);
    return (
      '<button data-ag="day" data-id="' +
      key +
      '" aria-label="' +
      d.toLocaleDateString('ru', { dateStyle: 'full' }) +
      '" aria-pressed="' +
      (key === selected) +
      '" class="' +
      (d.getMonth() !== month.getMonth() ? 'other ' : '') +
      (key === today ? 'today ' : '') +
      (events.some((e) => occursOn(e, d)) ? 'marked' : '') +
      '">' +
      d.getDate() +
      '</button>'
    );
  }).join('');
  const rows = events
    .filter((e) => occursOn(e, day))
    .sort((a, b) => timeOf(new Date(calendarStart(a))).localeCompare(timeOf(new Date(calendarStart(b)))));
  return (
    '<div class="monthGrid"><header><b>' +
    monthName.format(month) +
    '</b>' +
    control('prev', 'Предыдущий месяц', 'chevron-left') +
    control('next', 'Следующий месяц', 'chevron-right') +
    '</header><div class="monthCells">' +
    weekday.map((w) => '<small>' + w + '</small>').join('') +
    cells +
    '</div></div><section class="agendaDay"><header><b>' +
    dayName.format(day) +
    '</b>' +
    control('add', 'Добавить событие', 'plus') +
    '</header>' +
    (draft ? editor() : '') +
    rows
      .map(
        (e) =>
          '<div class="agendaRow"><button data-ag="edit" data-id="' +
          esc(e.id) +
          '"><time>' +
          timeOf(new Date(e.time)) +
          '</time> ' +
          esc(e.text) +
          '</button>' +
          control('remove', 'Удалить событие', 'x', e.id) +
          '</div>',
      )
      .join('') +
    (!rows.length && !draft ? '<p>Ничего не запланировано</p>' : '') +
    '</section>'
  );
}
function editor() {
  return (
    '<form id="agendaForm"><label>Время<input name="time" required type="time" value="' +
    esc(draft.time) +
    '"></label>' +
    '<input name="text" maxlength="10000" required aria-label="Текст записи" placeholder="' +
    (mode === 'events' ? 'Событие...' : 'Текст напоминания...') +
    '" value="' +
    esc(draft.text) +
    '">' +
    '<details' +
    (draft.repeat || draft.routineId ? ' open' : '') +
    '><summary>Параметры</summary>' +
    '<label>Дата<input name="date" required type="date" value="' +
    esc(draft.date) +
    '"></label>' +
    '<label>Повтор<select name="repeat">' +
    [
      ['', 'Один раз'],
      ['day', 'Ежедневно'],
      ['week', 'Еженедельно'],
    ]
      .map(
        ([v, t]) =>
          '<option value="' + v + '" ' + (draft.repeat === v ? 'selected' : '') + '>' + t + '</option>',
      )
      .join('') +
    '</select></label>' +
    '<label>Команда<select name="routine"><option value="">Без команды</option>' +
    state.routines
      .map(
        (r) =>
          '<option value="' +
          esc(r.id) +
          '" ' +
          (r.id === draft.routineId ? 'selected' : '') +
          '>' +
          esc(r.name) +
          '</option>',
      )
      .join('') +
    '</select></label></details>' +
    '<div><button type="submit">Сохранить</button><button type="button" data-ag="cancel">Отмена</button></div></form>'
  );
}
function reminders() {
  const items = state.events.filter((e) => e.category !== 'calendar').sort((a, b) => a.time - b.time);
  $('#agendaCount').textContent = items.length || '';
  return (
    '<div class="reminderGrid">' +
    (draft ? editor() : '') +
    items
      .filter((e) => e.id !== draft?.id)
      .map(
        (e) =>
          '<article><header><button data-ag="edit" data-id="' +
          esc(e.id) +
          '"><b>' +
          timeOf(new Date(e.time)) +
          '</b></button>' +
          control('remove', 'Удалить напоминание', 'x', e.id) +
          '</header>' +
          '<button class="reminderText" data-ag="edit" data-id="' +
          esc(e.id) +
          '">' +
          esc(e.text) +
          '</button>' +
          '<footer><span>' +
          ({ day: 'Ежедневно', week: 'Еженедельно' }[e.repeat] || dayName.format(new Date(e.time))) +
          '</span>' +
          '<button role="switch" aria-label="Активное напоминание" aria-checked="' +
          (!e.fired && !e.disabled) +
          '" data-ag="enable" data-id="' +
          esc(e.id) +
          '">' +
          (!e.fired && !e.disabled ? 'Вкл' : 'Выкл') +
          '</button></footer></article>',
      )
      .join('') +
    (draft ? '' : '<button class="reminderAdd" data-ag="add" aria-label="Добавить напоминание">＋</button>') +
    '</div>'
  );
}
function paint() {
  const marked = (el) => [...el.querySelectorAll('.monthCells .marked')].map((b) => b.dataset.id);
  const oldDays = new Set(marked(body));
  const monthKey = mode === 'events' ? month.getFullYear() + '/' + month.getMonth() : '';
  const sameMonth = body.dataset.monthKey === monthKey;
  body.dataset.monthKey = monthKey;
  const animate = rowChanges(
    body,
    '.agendaRow,.reminderGrid article',
    mode + (mode === 'events' ? day.toDateString() : ''),
  );
  body.innerHTML = mode === 'events' ? calendar() : reminders();
  animate();
  if (dialog.open && mode === 'events') {
    if (!sameMonth) appear(body.querySelector('.monthCells'), { opacity: 0 }, 140);
    else
      for (const day of body.querySelectorAll('.monthCells .marked'))
        if (!oldDays.has(day.dataset.id)) appear(day, { opacity: 0, scale: '.98' }, 150);
  }
}
function begin(row) {
  const now = new Date();
  const date = row ? new Date(calendarStart(row)) : new Date(mode === 'events' ? day : now);
  if (!row) {
    date.setHours(mode === 'events' ? 12 : 9, 0, 0, 0);
    if (mode === 'reminders' && date <= now) date.setDate(date.getDate() + 1);
  }
  draft = {
    id: row?.id,
    text: row?.text || '',
    time: timeOf(date),
    date: localKey(date),
    repeat: row?.repeat ?? (mode === 'reminders' ? 'day' : ''),
    routineId: row?.routineId || '',
  };
  paint();
  body.querySelector('[name=text]').focus();
}
export async function openAgenda(kind, add = false, id = '') {
  state = await call('state');
  mode = kind;
  day = new Date();
  month = new Date(day.getFullYear(), day.getMonth(), 1, 12);
  draft = null;
  dialog.dataset.mode = kind;
  $('#agendaHeading').innerHTML =
    ico(kind === 'events' ? 'calendar-days' : 'bell') + (kind === 'events' ? 'Календарь' : 'Напоминания');
  $('#agendaCount').textContent = '';
  $('#agendaOptions').hidden = true;
  $('#calendarPlace option[value=wallpaper]').disabled = state.platform !== 'win32';
  $('#calendarPlace').value = state.screenWidgets?.events
    ? state.screenWidgets.events.wallpaper
      ? 'wallpaper'
      : state.screenWidgets.events.pin
        ? 'pin'
        : 'window'
    : 'off';
  const item = id ? state.events.find((e) => e.id === id) : undefined;
  if (item && kind === 'events') {
    day = new Date(calendarStart(item));
    month = new Date(day.getFullYear(), day.getMonth(), 1, 12);
  }
  paint();
  if (!dialog.open) dialog.showModal();
  if (add || item) begin(item);
}
export function syncAgenda(s) {
  if (!dialog.open) return;
  state = s;
  if (!draft) paint();
}
dialog.addEventListener('submit', async (e) => {
  if (e.target.id !== 'agendaForm') return;
  e.preventDefault();
  if (saving) return;
  saving = true;
  const f = e.target.elements;
  try {
    const date = new Date(f.date.value + 'T' + f.time.value);
    await call('add', {
      kind: 'events',
      id: draft.id,
      text: f.text.value,
      time: date.getTime(),
      repeat: f.repeat.value,
      routineId: f.routine.value,
      category: mode === 'events' ? 'calendar' : 'reminder',
    });
    state = await call('state');
    draft = null;
    if (mode === 'events') {
      day = date;
      month = new Date(day.getFullYear(), day.getMonth(), 1, 12);
    }
    paint();
  } catch (err) {
    reportError(err);
  } finally {
    saving = false;
  }
});
dialog.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ag]');
  if (!b || saving) return;
  const op = b.dataset.ag,
    id = b.dataset.id;
  try {
    if (op === 'close') {
      dialog.close();
      return;
    }
    if (op === 'options') {
      $('#agendaOptions').hidden = !$('#agendaOptions').hidden;
      return;
    }
    if (op === 'add' || op === 'edit') {
      begin(id ? state.events.find((e) => e.id === id) : undefined);
      return;
    }
    if (op === 'prev' || op === 'next')
      month = new Date(month.getFullYear(), month.getMonth() + (op === 'next' ? 1 : -1), 1, 12);
    if (op === 'day') {
      day = new Date(id + 'T12:00');
      month = new Date(day.getFullYear(), day.getMonth(), 1, 12);
    }
    if (op === 'remove') await call('remove', { kind: 'events', id });
    if (op === 'enable') {
      const row = state.events.find((e) => e.id === id);
      await call('enableReminder', { id, enabled: !!row.disabled || !!row.fired });
    }
    state = await call('state');
    draft = null;
    paint();
  } catch (err) {
    reportError(err);
  }
});
$('#calendarPlace').onchange = (e) =>
  call('screenWidget', { id: 'events', mode: e.target.value }).catch(reportError);
