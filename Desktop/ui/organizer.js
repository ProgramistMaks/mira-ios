import { $, call, esc, ico, toast } from './shared.js';
import { noteDocument, noteLabel, noteTag, sortedNotes, taskListOf } from './note-format.mjs';

const dialog = $('#organizer'),
  list = $('#orgList'),
  pane = $('#orgPane');
const commands = [
  ['bold', 'Полужирный (Ctrl+B)', 'B'],
  ['italic', 'Курсив (Ctrl+I)', 'I'],
  ['underline', 'Подчёркнутый (Ctrl+U)', 'U'],
  ['strikeThrough', 'Зачёркнутый', 'S'],
  ['code', 'Код в строке', '&lt;/&gt;'],
  ['heading', 'Заголовок', 'H'],
  ['insertUnorderedList', 'Маркированный список', '• ≡'],
  ['insertOrderedList', 'Нумерованный список', '1 ≡'],
  ['quote', 'Цитата', '❞'],
  ['clear', 'Очистить форматирование', 'T×'],
];
let finishInput;
let mode,
  data,
  selected,
  serial = 0,
  lastWrite = Promise.resolve(),
  writeError,
  pending = 0;
const button = (action, label, icon, id = '') =>
  '<button type="button" data-org="' +
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
function readNodes(parent, depth = 0) {
  if (depth > 32) throw Error('Слишком сложное форматирование заметки');
  return [...parent.childNodes].flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) return [node.data.replaceAll('\u200b', '')];
    if (
      node.nodeType !== Node.ELEMENT_NODE ||
      ['script', 'style', 'template', 'svg', 'iframe', 'object'].includes(node.localName)
    )
      return [];
    const tag = noteTag(node.localName);
    const children = readNodes(node, depth + 1);
    return tag ? [{ tag, children }] : children;
  });
}
function renderNode(node) {
  if (typeof node === 'string') return document.createTextNode(node);
  const tag = noteTag(node.tag);
  const el = tag ? document.createElement(tag) : document.createDocumentFragment();
  el.append(...(node.children || []).map(renderNode));
  return el;
}
function noteById() {
  return data.notes.find((n) => n.id === selected);
}
function navigation() {
  const notes = mode === 'notes';
  dialog.dataset.mainList = String(selected === 'main');
  $('#orgCount').textContent = notes ? String(data.notes.length) : '';
  list.innerHTML =
    (notes ? sortedNotes(data.notes) : data.taskLists)
      .map(
        (row) =>
          '<button class="orgRow" data-org="select" data-id="' +
          esc(row.id) +
          '" aria-current="' +
          (row.id === selected) +
          '">' +
          (notes && row.pinned ? ico('pin') : '') +
          '<span>' +
          esc(notes ? noteLabel(row) : row.name) +
          '</span>' +
          (notes
            ? ''
            : '<small>' + data.tasks.filter((t) => taskListOf(t) === row.id && !t.done).length + '</small>') +
          '</button>',
      )
      .join('') + (notes ? '' : '<button class="orgNewList" data-org="newList">＋ Добавить список</button>');
}
function noteEditor() {
  const n = noteById();
  if (!n) {
    pane.innerHTML =
      '<div class="orgEmpty"><p>Чистый лист. Добавь первую заметку — я запомню.</p><button data-org="add">＋ Новая заметка</button></div>';
    return;
  }
  pane.innerHTML =
    '<div class="noteControls"><div class="noteTools" role="toolbar" aria-label="Форматирование">' +
    commands
      .map(
        ([cmd, title, label]) =>
          '<button data-format="' +
          cmd +
          '" aria-label="' +
          title +
          '" title="' +
          title +
          '">' +
          label +
          '</button>',
      )
      .join('') +
    '</div>' +
    button('pin', n.pinned ? 'Открепить заметку' : 'Закрепить заметку', 'pin') +
    button('removeNote', 'Удалить заметку', 'trash-2') +
    '</div>' +
    '<input id="noteTitle" maxlength="200" placeholder="Заголовок" aria-label="Заголовок заметки">' +
    '<div id="noteBody" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Текст заметки" data-placeholder="Напиши заметку…"></div>';
  pane.querySelector('[data-org=pin]').setAttribute('aria-pressed', String(!!n.pinned));
  $('#noteTitle').value = n.title || '';
  const body = $('#noteBody');
  if (Array.isArray(n.body)) body.replaceChildren(...n.body.map(renderNode));
  else body.textContent = n.text || '';
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html && html.length <= 180000) {
      try {
        const source = document.createElement('template');
        source.innerHTML = html;
        const clean = document.createElement('div');
        clean.append(...noteDocument(readNodes(source.content)).map(renderNode));
        if (clean.textContent || clean.querySelector('br')) {
          document.execCommand('insertHTML', false, clean.innerHTML);
          return;
        }
      } catch {
        /* Oversized or unsupported rich text can still be pasted as plain text. */
      }
    }
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  body.addEventListener('drop', (e) => e.preventDefault());
  $('#noteTitle').oninput = body.oninput = saveNote;
}
function saveNote() {
  const id = selected,
    generation = ++serial,
    n = noteById();
  const title = $('#noteTitle').value;
  let body;
  try {
    body = readNodes($('#noteBody'));
  } catch (e) {
    writeError = e;
    toast(e.message);
    return;
  }
  Object.assign(n, { title, body, text: [title, $('#noteBody').innerText].filter(Boolean).join('\n') });
  writeError = undefined;
  navigation();
  // IPC receives edits in issue order. Older replies must not roll back a later keystroke.
  pending++;
  lastWrite = call('writeNote', { id, title, body })
    .catch((e) => {
      if (generation === serial) {
        writeError = e;
        toast(e.message);
      }
    })
    .finally(() => {
      pending--;
    });
}
async function flush() {
  await lastWrite;
  if (writeError) throw writeError;
}
function format(cmd) {
  const editor = $('#noteBody');
  const sel = getSelection();
  if (!sel.rangeCount || !editor.contains(sel.anchorNode) || !editor.contains(sel.focusNode)) {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  const parent =
    sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
  if (cmd === 'heading' || cmd === 'quote') {
    const tag = cmd === 'heading' ? 'h2' : 'blockquote';
    document.execCommand('formatBlock', false, parent.closest(tag) ? 'p' : tag);
  } else if (cmd === 'code') {
    const code = parent.closest('code');
    if (code && editor.contains(code)) {
      const text = document.createTextNode(code.textContent.replaceAll('\u200b', ''));
      code.replaceWith(text);
      sel.collapse(text, text.length);
    } else {
      const range = sel.getRangeAt(0),
        el = document.createElement('code');
      if (range.collapsed) el.textContent = '\u200b';
      else el.append(range.extractContents());
      range.insertNode(el);
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else if (cmd === 'clear') {
    document.execCommand('removeFormat');
    document.execCommand('formatBlock', false, 'p');
  } else document.execCommand(cmd);
  if (cmd === 'code') saveNote();
  updateFormatState();
}
function taskPane(editId = '') {
  const rows = data.tasks.filter((t) => taskListOf(t) === selected);
  pane.innerHTML =
    '<div id="taskRows">' +
    (rows.length
      ? rows
          .map(
            (t) =>
              '<div class="orgTask' +
              (t.done ? ' done' : '') +
              '">' +
              button(
                'toggle',
                t.done ? 'Вернуть в работу' : 'Отметить выполненной',
                t.done ? 'check-check' : 'circle-dot',
                t.id,
              ) +
              '<button class="taskText" data-org="editTask" data-id="' +
              esc(t.id) +
              '">' +
              esc(t.text) +
              '</button>' +
              button('removeTask', 'Удалить задачу', 'x', t.id) +
              '</div>',
          )
          .join('')
      : '<div class="orgEmpty">В этом списке пусто — можно выдохнуть.</div>') +
    '</div><button class="taskAdd" data-org="add">＋ Добавить задачу</button>';
  if (editId) taskInput(editId);
}
function taskInput(id) {
  if ($('#orgTaskText')) {
    $('#orgTaskText').focus();
    return;
  }
  const row = data.tasks.find((t) => t.id === id);
  const input = document.createElement('input');
  input.id = 'orgTaskText';
  input.placeholder = 'Задача...';
  input.maxLength = 10000;
  input.value = row?.text || '';
  input.setAttribute('aria-label', 'Текст задачи');
  if (row) pane.querySelector('.taskText[data-id="' + CSS.escape(id) + '"]').replaceWith(input);
  else {
    $('#taskRows .orgEmpty')?.remove();
    $('#taskRows').prepend(input);
  }
  input.focus();
  const listId = selected;
  let done = false;
  async function commit(cancel) {
    if (done) return;
    done = true;
    try {
      const text = input.value.trim();
      if (!cancel && text && text !== row?.text)
        await call('add', { kind: 'tasks', id: row?.id, list: listId, text });
      data = await call('state');
      if (finishInput === commit) finishInput = undefined;
      if (dialog.open && mode === 'tasks' && selected === listId) {
        navigation();
        taskPane();
      }
    } catch (e) {
      toast(e.message);
      done = false;
    }
  }
  input.onkeydown = (e) => {
    if (['Enter', 'Escape'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      commit(e.key === 'Escape');
    }
  };
  finishInput = commit;
  input.onblur = () => commit(false);
}
function paint() {
  navigation();
  if (mode === 'notes') noteEditor();
  else taskPane();
}
export async function openOrganizer(kind, id, create = false) {
  await flush();
  mode = kind;
  data = await call('state');
  if (kind === 'notes') {
    if (create) {
      const note = await call('createNote');
      data = await call('state');
      selected = note.id;
    } else selected = id || sortedNotes(data.notes)[0]?.id;
  } else
    selected =
      id && data.tasks.some((t) => t.id === id)
        ? taskListOf(data.tasks.find((t) => t.id === id))
        : data.activeTaskList;
  dialog.dataset.mode = mode;
  $('#orgHeading').innerHTML =
    ico(kind === 'notes' ? 'notebook-pen' : 'list-checks') + (kind === 'notes' ? 'Заметки' : 'Задачи');
  $('#orgAdd').setAttribute('aria-label', kind === 'notes' ? 'Добавить заметку' : 'Добавить задачу');
  $('#orgPlace').value = data.screenWidgets?.[kind]
    ? data.screenWidgets[kind].pin
      ? 'pin'
      : 'window'
    : 'off';
  $('#orgOptions').hidden = true;
  paint();
  if (!dialog.open) dialog.showModal();
  if (create && kind === 'notes') $('#noteTitle').focus();
  if (kind === 'tasks' && (create || id)) taskInput(id);
}
export function syncOrganizer(s) {
  if (!dialog.open || pending || writeError) return;
  data = s;
  if (mode === 'notes' && selected && !noteById()) {
    selected = sortedNotes(data.notes)[0]?.id;
    paint();
    return;
  }
  if (mode === 'tasks' && !data.taskLists.some((l) => l.id === selected)) selected = data.activeTaskList;
  if (!$('#orgListName')) navigation();
  if (mode === 'tasks' && !$('#orgTaskText')) taskPane();
}
async function action(op, id) {
  if (op === 'close' && writeError) {
    if (!window.confirm('Последнее изменение не сохранено. Закрыть редактор без него?')) return;
    writeError = undefined;
  }
  await flush();
  if (finishInput) await finishInput(false);
  if (op === 'close') {
    dialog.close();
    return;
  }
  if (op === 'options') {
    $('#orgOptions').hidden = !$('#orgOptions').hidden;
    return;
  }
  if (op === 'select') {
    if (mode === 'tasks') await call('taskList', { action: 'select', id });
    selected = id;
    paint();
    return;
  }
  if (op === 'add' && mode === 'notes') return openOrganizer(mode, undefined, true);
  if (op === 'add' || op === 'editTask') {
    taskInput(id);
    return;
  }
  if (op === 'newList' || op === 'renameList') {
    const rename = op === 'renameList';
    $('#orgOptions').hidden = true;
    navigation();
    const input = document.createElement('input');
    input.id = 'orgListName';
    input.placeholder = 'Название списка';
    input.maxLength = 80;
    input.setAttribute('aria-label', 'Название списка');
    if (rename) input.value = data.taskLists.find((l) => l.id === selected).name;
    list.append(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = async (cancel) => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      try {
        if (!cancel && name)
          selected = await call('taskList', { action: rename ? 'rename' : 'create', id: selected, name });
        data = await call('state');
        paint();
      } catch (e) {
        toast(e.message);
        finished = false;
      }
    };
    input.onkeydown = (e) => {
      if (['Enter', 'Escape'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        finish(e.key === 'Escape');
      }
    };
    input.onblur = () => finish(false);
    return;
  }
  if (op === 'removeList') {
    await call('taskList', { action: 'remove', id: selected });
    selected = 'main';
    $('#orgOptions').hidden = true;
  }
  if (op === 'pin') await call('pinNote', { id: selected, pinned: !noteById().pinned });
  if (op === 'removeNote') await call('remove', { kind: 'notes', id: selected });
  if (op === 'removeTask') await call('remove', { kind: 'tasks', id });
  if (op === 'toggle') await call('toggleTask', { id });
  data = await call('state');
  if (mode === 'notes' && !noteById()) selected = sortedNotes(data.notes)[0]?.id;
  paint();
}
dialog.addEventListener('mousedown', (e) => {
  if (
    e.target.closest('[data-format]') ||
    (document.activeElement?.id === 'orgTaskText' && e.target.closest('[data-org]'))
  )
    e.preventDefault();
});
dialog.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b?.dataset.format) format(b.dataset.format);
  if (b?.dataset.org) action(b.dataset.org, b.dataset.id).catch((e) => toast(e.message));
});
dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  action('close').catch((err) => toast(err.message));
});
$('#orgPlace').onchange = (e) =>
  call('screenWidget', { id: mode, mode: e.target.value }).catch((err) => toast(err.message));

function updateFormatState() {
  const body = $('#noteBody'),
    selection = getSelection();
  if (!dialog.open || mode !== 'notes' || !body || !body.contains(selection.anchorNode)) return;
  const el =
    selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
  for (const b of pane.querySelectorAll('[data-format]')) {
    const cmd = b.dataset.format,
      tag = { code: 'code', heading: 'h2', quote: 'blockquote' }[cmd];
    if (cmd !== 'clear')
      b.setAttribute('aria-pressed', String(tag ? !!el.closest(tag) : document.queryCommandState(cmd)));
  }
}
document.addEventListener('selectionchange', updateFormatState);
