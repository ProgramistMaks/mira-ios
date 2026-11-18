import { $, ico, call, reportError } from './shared.js';

let unread = 0;
const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const trigger = $('#journalButton'),
  panel = $('#journalPanel'),
  list = $('#journalList');

function drawBadge() {
  trigger.hidden = list.childElementCount === 0;
  $('#journalCount').hidden = !unread;
  $('#journalCount').textContent = unread > 9 ? '9+' : String(unread);
  trigger.setAttribute('aria-label', unread ? 'Журнал ошибок. Новых: ' + unread : 'Журнал ошибок');
  $('#journalTitle').textContent = 'Ошибки (' + list.childElementCount + '/20)';
}
function addError(message) {
  const row = document.createElement('li'),
    time = document.createElement('time'),
    label = document.createElement('span'),
    button = document.createElement('button');
  time.textContent = clock.format(Date.now());
  label.textContent = message;
  button.type = 'button';
  button.title = 'Копировать';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = ico('copy');
  button.onclick = async () => {
    try {
      await call('copyError', { message });
    } catch (e) {
      reportError(e);
      return;
    }
    button.title = 'Скопировано';
    button.setAttribute('aria-label', button.title);
    button.innerHTML = ico('check');
  };
  row.append(time, label, button);
  list.prepend(row);
  if (list.childElementCount > 20) list.lastElementChild.remove();
  unread++;
  drawBadge();
}
window.addEventListener('mira-error', (e) => addError(e.detail));
panel.addEventListener('beforetoggle', (e) => {
  trigger.setAttribute('aria-expanded', String(e.newState === 'open'));
  if (e.newState === 'open') {
    unread = 0;
    drawBadge();
  }
});
$('#journalClear').onclick = () => {
  panel.hidePopover();
  unread = 0;
  list.replaceChildren();
  drawBadge();
  $('#serviceVoice').focus();
};

document.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape' || !panel.matches(':popover-open')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    panel.hidePopover();
    trigger.focus();
  },
  true,
);
