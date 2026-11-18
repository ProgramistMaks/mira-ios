import { rollingNumber, appear, setReduced } from './motion.js';
import { esc, $ } from './shared.js';
const call = (op, more = {}) => window.desk.call('islandAction', { op, ...more });
let state,
  tab = 'desk',
  serial = 0;
const tabs = { desk: 'Виджеты', chat: 'Чат', history: 'История', clip: 'Буфер', shelf: 'Полка' };
function button(op, label, id = '') {
  return '<button data-op="' + op + '" data-id="' + esc(id) + '">' + esc(label) + '</button>';
}
function rows(list, op, key) {
  return list
    .map(
      (r) =>
        '<div class="row">' +
        button(op, r[key], r.id) +
        (op === 'open' ? button('remove', 'Убрать', r.id) : '') +
        '</div>',
    )
    .join('');
}
async function draw() {
  const seq = ++serial,
    s = await call('state');
  if (seq !== serial) return;
  setReduced(s.reduced);
  const section = $('#body');
  if (s.expanded && (!state?.expanded || section.dataset.tab !== tab))
    appear(section, { opacity: 0, translate: '0 5px', scale: '.98' }, 200, 'cubic-bezier(.34,1.42,.7,1)');
  section.dataset.tab = tab;
  document.body.toggleAttribute('data-active-voice', s.voice !== 'off');
  state = s;
  $('#label').textContent = s.voice === 'off' ? s.name : s.voice === 'waiting' ? 'Жду имени' : 'Разговор';
  $('main').hidden = !s.expanded;
  $('#expand').setAttribute('aria-expanded', String(s.expanded));
  $('nav').innerHTML = Object.entries(tabs)
    .map(([id, n]) => '<button data-tab="' + id + '" aria-current="' + (tab === id) + '">' + n + '</button>')
    .join('');
  const input = $('#line'),
    draft = input?.value || '',
    focus = input === document.activeElement,
    body = $('#body');
  if (tab === 'shelf')
    body.innerHTML =
      button('pick', 'Добавить файлы') + (rows(s.shelf, 'open', 'name') || '<p>Перетащи файлы сюда.</p>');
  if (tab === 'clip')
    body.innerHTML =
      button('record', s.record ? 'Выключить историю' : 'Запоминать скопированный текст') +
      (s.history.length ? button('clear', 'Очистить') : '') +
      rows(s.history, 'copy', 'text');
  if (tab === 'history') body.innerHTML = rows(s.chats, 'chat', 'title') || '<p>Разговоров пока нет.</p>';
  if (tab === 'desk')
    body.innerHTML =
      '<p>Фокус · ' +
      (s.focus.ends ? Math.max(0, Math.ceil((s.focus.ends - Date.now()) / 60000)) + ' мин' : 'пауза') +
      '</p><b>Задачи</b>' +
      s.tasks.map((x) => '<p>' + esc(x.text) + '</p>').join('') +
      '<b>Заметки</b>' +
      s.notes.map((x) => '<p>' + esc(x.text) + '</p>').join('');
  if (tab === 'chat') {
    body.innerHTML =
      '<form><input id="line" aria-label="Сообщение" placeholder="Напиши Мире"><button>Отправить</button></form>' +
      s.last
        .map((x) => '<p><b>' + esc(x.role === 'user' ? 'Ты' : s.name) + '</b> · ' + esc(x.text) + '</p>')
        .join('');
    $('#line').value = draft;
    if (focus) $('#line').focus();
  }
}
const fail = (e) => {
  $('#error').textContent = e.message;
  setTimeout(() => ($('#error').textContent = ''), 3500);
};
document.onclick = async (e) => {
  try {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'expand') await call('size', { id: !state.expanded });
    else if (b.id === 'mic') await call('voice');
    else if (b.dataset.tab) tab = b.dataset.tab;
    else if (b.dataset.op) await call(b.dataset.op, { id: b.dataset.id });
    else return;
    await draw();
  } catch (e) {
    fail(e);
  }
};
document.onsubmit = (e) => {
  e.preventDefault();
  const text = $('#line').value.trim();
  if (text)
    call('chat', { text, id: state.chatId })
      .then(() => ($('#line').value = ''))
      .catch(fail);
};
document.ondragover = (e) => e.preventDefault();
document.ondrop = async (e) => {
  e.preventDefault();
  try {
    await call('drop', { paths: [...e.dataTransfer.files].map((f) => window.desk.filePath(f)) });
    tab = 'shelf';
    await call('size', { id: true });
    await draw();
  } catch (err) {
    fail(err);
  }
};
function clock() {
  rollingNumber($('time'), new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
}
clock();
setInterval(clock, 1000);
window.desk.on((e) => {
  if (e.type === 'island') draw().catch(fail);
});
draw().catch(fail);
