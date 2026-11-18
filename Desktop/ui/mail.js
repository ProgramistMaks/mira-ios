import { $, call, esc, ico, toast } from './shared.js';
const dlg = $('#mailDialog'),
  body = $('#mailBody'),
  tools = $('#mailActions');
let view,
  boxId = '',
  screen = 'inbox',
  letter,
  reference,
  draft,
  busy = false,
  revision = 0,
  dirty = false;
let picture;
const action = (op, label, icon = '', id = '') =>
  '<button type="button" data-mail="' +
  op +
  '" data-id="' +
  esc(id) +
  '" title="' +
  esc(label) +
  '" aria-label="' +
  esc(label) +
  '">' +
  (icon ? ico(icon) : esc(label)) +
  '</button>';
const field = (name, label, value = '', type = 'text', extra = '') =>
  '<label>' +
  label +
  '<input name="' +
  name +
  '" type="' +
  type +
  '" value="' +
  esc(value) +
  '" ' +
  extra +
  '></label>';
const box = () => view?.boxes.find((b) => b.id === boxId);
const size = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.ceil(n / 1024) + ' КБ');
const stamp = (t) =>
  t
    ? new Date(t).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
function status(msg = '') {
  const el = $('#mailStatus');
  el.hidden = !msg;
  el.textContent = msg;
}
function header(title, buttons = '') {
  $('#mailHeading').innerHTML = ico('mail') + esc(title);
  $('#mailCount').textContent = screen === 'inbox' && box() ? box().inbox.rows.length : '';
  tools.innerHTML = buttons;
  dlg.dataset.screen = screen;
}
async function load() {
  const seq = ++revision,
    s = await call('mailView');
  if (!dlg.open || seq !== revision) return false;
  view = s;
  if (!box()) boxId = s.boxes[0]?.id || '';
  return true;
}
function drawInbox() {
  screen = 'inbox';
  dirty = false;
  const b = box();
  header(
    'Почта',
    (b
      ? action('compose', 'Новое письмо', 'pencil') + action('refresh', 'Проверить сейчас', 'refresh-cw')
      : '') + action('accounts', 'Почтовые ящики', 'settings'),
  );
  if (!b) {
    body.innerHTML =
      '<div class="mailEmpty">' +
      ico('mail') +
      '<h3>Ящики не подключены</h3><p>Подключи ящик по IMAP, чтобы видеть входящие на рабочем столе.</p>' +
      action('newBox', 'Добавить ящик') +
      '</div>';
    return;
  }
  body.innerHTML =
    '<div class="mailLayout"><aside>' +
    view.boxes
      .map(
        (v) =>
          '<button data-mail="select" data-id="' +
          esc(v.id) +
          '" aria-current="' +
          (v.id === boxId) +
          '">' +
          ico('mail') +
          '<span>' +
          esc(v.email) +
          '</span></button>',
      )
      .join('') +
    action('newBox', 'Добавить ящик', 'plus') +
    '</aside><section><header><b>Входящие</b>' +
    action('readAll', 'Отметить все прочитанными', 'check-check') +
    (b.web ? action('web', 'Открыть в веб-почте', 'external-link') : '') +
    '</header>' +
    (b.status ? '<p class="mailHint">' + esc(b.status) + '</p>' : '') +
    (b.inbox.rows.length
      ? b.inbox.rows
          .map(
            (m) =>
              '<button class="mailRow" data-mail="message" data-id="' +
              m.uid +
              '" data-unread="' +
              !m.seen +
              '"><b>' +
              esc(m.from) +
              '</b><time>' +
              esc(stamp(m.time)) +
              '</time><span>' +
              esc(m.subject) +
              '</span></button>',
          )
          .join('')
      : '<p class="mailHint">' +
        (b.inbox.updated ? 'Во входящих пока пусто' : 'Ожидаю проверки почты') +
        '</p>') +
    '</section></div>';
}
function accounts() {
  screen = 'accounts';
  header(
    'Почтовые ящики',
    action('inbox', 'Входящие', 'chevron-left') + action('newBox', 'Добавить ящик', 'plus'),
  );
  body.innerHTML =
    '<div class="mailSettings">' +
    view.boxes
      .map(
        (b) =>
          '<article><div><b>' +
          esc(b.email) +
          '</b><small>' +
          esc(view.providers[b.provider]) +
          ' · ' +
          b.every +
          ' мин · ' +
          b.limit +
          ' писем</small></div>' +
          action('edit', 'Изменить ящик', 'pencil', b.id) +
          action('delete', 'Удалить ящик', 'trash-2', b.id) +
          '</article>',
      )
      .join('') +
    action('newBox', 'Добавить ящик') +
    '</div>';
}
function edit(b) {
  screen = 'form';
  dirty = false;
  header(b ? 'Изменить ящик' : 'Добавить ящик');
  body.innerHTML =
    '<form id="mailForm" class="mailForm"><select name="provider" aria-label="Сервис почты">' +
    Object.entries(view.providers)
      .map(
        ([k, v]) =>
          '<option value="' +
          k +
          '" ' +
          (k === (b?.provider || 'gmail') ? 'selected' : '') +
          '>' +
          esc(v) +
          '</option>',
      )
      .join('') +
    '<option disabled>Outlook — требуется авторизация Microsoft</option></select>' +
    field(
      'email',
      'Адрес почты',
      b?.email,
      'email',
      'required autocomplete="off" placeholder="you@example.com"',
    ) +
    field(
      'password',
      'Пароль приложения',
      '',
      'password',
      'autocomplete="new-password" placeholder="' +
        (b?.hasPassword ? 'Сохранённый пароль' : 'Пароль приложения') +
        '"',
    ) +
    '<small>Создай пароль приложения в настройках почтового сервиса.</small>' +
    '<fieldset id="mailCustom">' +
    field('host', 'Сервер IMAP', b?.host) +
    field('port', 'Порт IMAP (TLS)', b?.port || 993, 'number', 'min="1" max="65535"') +
    field('smtpHost', 'Сервер SMTP', b?.smtpHost) +
    field('smtpPort', 'Порт SMTP', b?.smtpPort || 465, 'number', 'min="1" max="65535"') +
    '<label><input type="checkbox" name="smtpStartTLS" ' +
    (b?.smtpStartTLS ? 'checked' : '') +
    '> Использовать STARTTLS для SMTP</label></fieldset>' +
    field('every', 'Проверять каждые (минут)', b?.every || 5, 'number', 'required min="1" max="1440"') +
    field('limit', 'Сколько писем показывать', b?.limit || 20, 'number', 'required min="1" max="100"') +
    '<label class="mailCheck"><input name="cache" type="checkbox" ' +
    (b?.cache === false ? '' : 'checked') +
    '> Хранить открытые письма на этом компьютере семь дней</label>' +
    (!view.secureStorage
      ? '<small>В этом сеансе системное хранилище недоступно. После перезапуска пароль потребуется снова.</small>'
      : '') +
    '<footer>' +
    action('test', 'Проверить подключение') +
    action('accounts', 'Отмена') +
    '<button type="submit">Сохранить</button></footer></form>';
  const f = $('#mailForm');
  f.dataset.id = b?.id || '';
  function custom() {
    const on = f.elements.provider.value === 'custom';
    $('#mailCustom').hidden = !on;
    $('#mailCustom').disabled = !on;
  }
  custom();
  f.elements.provider.onchange = custom;
}
function credentials() {
  const f = $('#mailForm'),
    v = Object.fromEntries(new FormData(f));
  return {
    ...v,
    id: f.dataset.id,
    cache: f.elements.cache.checked,
    smtpStartTLS: f.elements.smtpStartTLS.checked,
  };
}
function message() {
  screen = 'message';
  header(
    'Входящие',
    action('inbox', 'Закрыть письмо', 'chevron-left') +
      action('reply', 'Ответить', 'reply') +
      action('forward', 'Переслать', 'forward'),
  );
  body.innerHTML =
    '<article class="mailLetter"><h3>' +
    esc(letter.subject) +
    '</h3><p>' +
    esc(letter.from) +
    ' &lt;' +
    esc(letter.sender) +
    '&gt;</p><small>Кому: ' +
    esc(letter.to) +
    ' · ' +
    esc(stamp(Date.parse(letter.date))) +
    '</small>' +
    (letter.offline ? '<small>Сохранённая копия</small>' : '') +
    '<div class="mailText">' +
    esc(letter.text) +
    '</div>' +
    (letter.attachments.length
      ? '<h4>Вложения</h4>' +
        letter.attachments
          .map(
            (a) =>
              action('export', a.name + ' · ' + size(a.size), '', a.index) +
              (a.preview ? action('preview', 'Посмотреть изображение', 'eye', a.index) : ''),
          )
          .join('')
      : '') +
    '</article>';
}
function compose(op) {
  screen = 'compose';
  dirty = false;
  const reply = op === 'reply',
    fwd = op === 'forward';
  draft = {
    id: boxId,
    files: [],
    forward: fwd
      ? letter.attachments.map((a) => ({ ...reference, index: a.index, name: a.name, size: a.size }))
      : [],
    reply: reply ? reference : null,
  };
  header('Новое письмо');
  body.innerHTML =
    '<form id="mailCompose" class="mailForm"><small>От кого: ' +
    esc(box().email) +
    '</small>' +
    field('to', 'Кому', reply ? letter.replyTo : '', 'text', 'required placeholder="you@example.com"') +
    field(
      'subject',
      'Тема',
      reply
        ? /^re:/i.test(letter.subject)
          ? letter.subject
          : 'Re: ' + letter.subject
        : fwd
          ? 'Fwd: ' + letter.subject
          : '',
    ) +
    '<label>Текст письма<textarea name="text" rows="7">' +
    esc(
      reply || fwd
        ? '\n\n' +
            (fwd ? 'Пересланное письмо от ' : 'Письмо от ') +
            letter.from +
            '\n' +
            letter.text
              .split('\n')
              .map((l) => '> ' + l)
              .join('\n')
        : '',
    ) +
    '</textarea></label><div id="mailParts"></div><footer>' +
    action('attach', 'Прикрепить', 'paperclip') +
    action('cancelCompose', 'Отменить письмо') +
    '<button type="submit">Отправить</button></footer></form>';
  parts();
  $('#mailCompose').elements[reply ? 'text' : 'to'].focus();
}
function parts() {
  $('#mailParts').innerHTML = [
    ...draft.files.map((a) => ({ ...a, key: 'file-' + a.id })),
    ...draft.forward.map((a) => ({ ...a, key: 'part-' + a.index })),
  ]
    .map(
      (a) =>
        '<div>' +
        esc(a.name) +
        ' · ' +
        size(a.size) +
        action('unattach', 'Убрать вложение', 'x', a.key) +
        '</div>',
    )
    .join('');
}
async function release() {
  if (draft) await call('mailRelease', { ids: draft.files.map((f) => f.id) });
  draft = null;
  dirty = false;
}
function mayLeave() {
  return !dirty || window.confirm('Закрыть без сохранения изменений?');
}
async function run(op, id) {
  status();
  if (op === 'select') {
    boxId = id;
    drawInbox();
    return;
  }
  if (op === 'accounts') {
    if (screen === 'form' && !mayLeave()) return;
    dirty = false;
    accounts();
    return;
  }
  if (op === 'inbox') {
    drawInbox();
    return;
  }
  if (op === 'newBox' || op === 'edit') {
    edit(view.boxes.find((v) => v.id === id));
    return;
  }
  if (op === 'web') return call('url', { url: box().web });
  if (op === 'test' || op === 'save') {
    const f = $('#mailForm');
    if (!f.reportValidity()) return;
    const args = credentials();
    status(op === 'test' ? 'Проверяю подключение…' : 'Сохраняю…');
    if (op === 'test') {
      await call('mailTest', args);
      status('Подключение работает');
      return;
    }
    boxId = await call('mailSave', args);
    dirty = false;
    await load();
    drawInbox();
    status();
    return;
  }
  if (op === 'delete') {
    if (!window.confirm('Отключить этот ящик и удалить его сохранённые письма с компьютера?')) return;
    await call('mailRemove', { id });
    await load();
    accounts();
    return;
  }
  if (op === 'refresh' || op === 'readAll') {
    status('Проверяю входящие…');
    await call(op === 'refresh' ? 'mailRefresh' : 'mailReadAll', { id: boxId });
    await load();
    drawInbox();
    status();
    return;
  }
  if (op === 'message' || op === 'large') {
    if (op === 'message') reference = { id: boxId, valid: box().inbox.valid, uid: Number(id) };
    status('Открываю письмо…');
    const result = await call('mailOpen', { ...reference, allowLarge: op === 'large' });
    if (result.large) {
      screen = 'large';
      header('Входящие', action('inbox', 'Назад', 'chevron-left'));
      body.innerHTML =
        '<div class="mailEmpty"><p>Размер письма — ' +
        size(result.large) +
        '</p>' +
        action('large', 'Всё равно загрузить') +
        '</div>';
    } else {
      letter = result;
      message();
    }
    status();
    return;
  }
  if (op === 'preview') {
    const { mime, bytes } = await call('mailPreview', { ...reference, index: Number(id) });
    picture = URL.createObjectURL(new Blob([bytes], { type: mime }));
    screen = 'picture';
    header(
      'Изображение из письма',
      action('backMessage', 'Закрыть изображение', 'chevron-left') +
        action('zoomOut', 'Отдалить', 'minus') +
        action('fit', 'Вписать в экран', 'maximize') +
        action('zoomIn', 'Приблизить', 'plus'),
    );
    body.innerHTML = '<div class="mailPreview"><img alt="Вложение письма"></div>';
    body.querySelector('img').src = picture;
    return;
  }
  if (op === 'backMessage') {
    URL.revokeObjectURL(picture);
    picture = null;
    message();
    return;
  }
  if (['zoomIn', 'zoomOut', 'fit'].includes(op)) {
    const img = body.querySelector('img');
    if (op === 'fit') {
      img.style.width = '';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
    } else {
      const width = img.getBoundingClientRect().width;
      img.style.maxWidth = img.style.maxHeight = 'none';
      img.style.width = Math.min(6000, Math.max(40, width * (op === 'zoomIn' ? 1.4 : 1 / 1.4))) + 'px';
    }
    return;
  }
  if (op === 'export') return call('mailExport', { ...reference, index: Number(id) });
  if (['compose', 'reply', 'forward'].includes(op)) {
    compose(op);
    return;
  }
  if (op === 'cancelCompose') {
    if (!mayLeave()) return;
    await release();
    drawInbox();
    return;
  }
  if (op === 'attach') {
    const files = await call('mailFiles');
    draft.files.push(...files);
    dirty ||= files.length > 0;
    parts();
    return;
  }
  if (op === 'unattach') {
    const fid = id.slice(5);
    if (id.startsWith('file-')) {
      await call('mailRelease', { ids: [fid] });
      draft.files = draft.files.filter((a) => a.id !== fid);
    } else draft.forward = draft.forward.filter((a) => a.index !== Number(fid));
    dirty = true;
    parts();
    return;
  }
  if (op === 'send') {
    const f = $('#mailCompose');
    if (!f.reportValidity()) return;
    status('Отправляю письмо…');
    const r = await call('mailSend', {
      ...draft,
      ...Object.fromEntries(new FormData(f)),
      files: draft.files.map((a) => a.id),
    });
    await release();
    drawInbox();
    status(
      r.rejected.length
        ? 'Сервер отклонил адреса: ' + r.rejected.join(', ')
        : 'Письмо принято почтовым сервером',
    );
  }
}
async function operate(op, id) {
  if (busy) return;
  busy = true;
  dlg.setAttribute('aria-busy', 'true');
  try {
    await run(op, id);
  } catch (e) {
    status(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  } finally {
    busy = false;
    dlg.removeAttribute('aria-busy');
  }
}
dlg.onclick = (e) => {
  const b = e.target.closest('[data-mail]');
  if (b) operate(b.dataset.mail, b.dataset.id);
};
dlg.oninput = () => {
  if (screen === 'form' || screen === 'compose') dirty = true;
};
dlg.onsubmit = (e) => {
  e.preventDefault();
  operate(e.target.id === 'mailForm' ? 'save' : 'send');
};
async function close() {
  if (busy || !mayLeave()) return;
  await release();
  if (picture) {
    URL.revokeObjectURL(picture);
    picture = null;
  }
  if (boxId) await call('mailClose', { id: boxId });
  revision++;
  dlg.close();
}
$('#mailClose').onclick = close;
dlg.oncancel = (e) => {
  e.preventDefault();
  close();
};
window.desk.on(async (e) => {
  if (e.type === 'mail' && dlg.open && (await load()) && !busy && screen === 'inbox') drawInbox();
});
export async function openMail() {
  if (!dlg.open) dlg.showModal();
  status();
  if (await load()) drawInbox();
}
