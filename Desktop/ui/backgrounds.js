import { $, esc, ico, select, reportError } from './shared.js';

const defaults = { mode: 'cozy', pattern: 'sketch', lamp: 1, texture: 0.4, selected: '' };
const modes = [
  ['solid', 'Сплошной цвет'],
  ['cozy', 'Уютный'],
  ['custom', 'Своё изображение или видео'],
];
const patterns = [
  ['grain', 'Зерно'],
  ['dots', 'Тетрадь в точку'],
  ['stars', 'Звёздочки'],
  ['sketch', 'Каракули'],
  ['none', 'Без узора'],
];
const types = new Set(['image/png', 'image/jpeg', 'video/mp4', 'video/webm']);
let prefs = { ...defaults },
  items = [],
  db,
  busy = false,
  pageVisible = false,
  reduced = false;
let shown;
const stage = $('#homeBackdrop');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function load() {
  const request = indexedDB.open('mira-backgrounds', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('settings');
    request.result.createObjectStore('files', { keyPath: 'id' });
  };
  const database = await requestResult(request);
  const tx = database.transaction(['settings', 'files']);
  const [saved, files] = await Promise.all([
    requestResult(tx.objectStore('settings').get('home')),
    requestResult(tx.objectStore('files').getAll()),
  ]);
  prefs = { ...defaults, ...saved };
  items = files
    .sort((a, b) => a.created - b.created)
    .map((file) => ({ ...file, url: URL.createObjectURL(file.blob) }));
  db = database;
  drawControls();
  display();
}
async function commit(next, add, remove) {
  const tx = db.transaction(['settings', 'files'], 'readwrite');
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || Error('Не удалось сохранить фон'));
  });
  tx.objectStore('settings').put(next, 'home');
  if (add) tx.objectStore('files').add(add);
  if (remove) tx.objectStore('files').delete(remove);
  await done;
  if (remove) {
    const old = items.find((f) => f.id === remove);
    URL.revokeObjectURL(old.url);
    items = items.filter((f) => f !== old);
  }
  if (add) items.push({ ...add, url: URL.createObjectURL(add.blob) });
  prefs = next;
  display();
}
function playback() {
  const video = stage.querySelector('video');
  if (!video) return;
  if (pageVisible && !document.hidden && !reduced && !reducedMotion.matches) {
    if (video.paused)
      video.play().catch((e) => {
        if (e.name !== 'AbortError') reportError(e);
      });
  } else video.pause();
}
function display() {
  const file = prefs.mode === 'custom' && items.find((f) => f.id === prefs.selected);
  const id = file?.id || '';
  if (id !== shown) {
    const oldVideo = stage.querySelector('video');
    if (oldVideo) oldVideo.pause();
    stage.replaceChildren();
    if (file) {
      const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
      if (media.tagName === 'VIDEO') {
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.preload = 'auto';
      } else media.alt = '';
      media.src = file.url;
      stage.append(media);
    }
    shown = id;
  }
  stage.hidden = !pageVisible;
  stage.dataset.mode = prefs.mode;
  stage.dataset.pattern = prefs.pattern;
  stage.style.setProperty('--lamp', String(prefs.lamp));
  stage.style.setProperty('--texture', String(prefs.texture));
  playback();
}
export function updateBackdrop(home, reduce) {
  pageVisible = home;
  reduced = reduce;
  display();
}
function range(label, id, value) {
  return (
    '<label class="field">' +
    label +
    '<input type="range" id="' +
    id +
    '" min="0" max="1" step=".05" value="' +
    value +
    '"></label>'
  );
}
export function backgroundControls() {
  return '<div id="backgroundControls">' + controls() + '</div>';
}
function controls() {
  let html = select('Фон', 'wallMode', modes, prefs.mode);
  if (prefs.mode === 'cozy')
    html +=
      select('Узор', 'wallPattern', patterns, prefs.pattern) +
      range('Свет лампы', 'wallLamp', prefs.lamp) +
      range('Текстура', 'wallTexture', prefs.texture);
  if (prefs.mode === 'custom') {
    html +=
      '<h4>Свои фоны</h4><label class="btn uploadBackground">' +
      ico('upload') +
      'Загрузить<input aria-label="Загрузить фон" id="wallFile" type="file" accept="image/png,image/jpeg,video/mp4,video/webm"></label>' +
      '<div class="wallGallery">' +
      items
        .map(
          (f) =>
            '<div class="wallTile"><button type="button" data-wall="select" data-id="' +
            f.id +
            '" aria-pressed="' +
            (f.id === prefs.selected) +
            '" title="' +
            esc(f.name) +
            '">' +
            (f.type.startsWith('video/')
              ? '<video muted preload="metadata" src="' + f.url + '"></video>'
              : '<img alt="" src="' + f.url + '">') +
            '<span>' +
            esc(f.name) +
            '</span></button><button data-wall="remove" data-id="' +
            f.id +
            '" type="button" aria-label="Удалить ' +
            esc(f.name) +
            '" title="Удалить">' +
            ico('trash-2') +
            '</button></div>',
        )
        .join('') +
      '</div>';
  }
  return '<fieldset' + (!db || busy ? ' disabled' : '') + '>' + html + '</fieldset>';
}
function drawControls(focusId) {
  const panel = $('#backgroundControls');
  if (!panel) return;
  panel.innerHTML = controls();
  if (focusId && !busy) document.getElementById(focusId)?.focus({ preventScroll: true });
}
async function validateFile(file) {
  if (!types.has(file.type)) throw Error('Выбери PNG, JPEG, MP4 или WebM.');
  const video = file.type.startsWith('video/');
  const limit = video ? 128 : 12;
  if (file.size > limit * 1024 * 1024) throw Error('Файл фона должен быть не больше ' + limit + ' МБ.');
  const url = URL.createObjectURL(file);
  const el = document.createElement(video ? 'video' : 'img');
  try {
    await new Promise((resolve, reject) => {
      const fail = () => reject(Error('Не удалось прочитать изображение или видео.'));
      const timer = setTimeout(fail, 12000);
      el[video ? 'onloadeddata' : 'onload'] = () => {
        clearTimeout(timer);
        resolve();
      };
      el.onerror = () => {
        clearTimeout(timer);
        fail();
      };
      el.muted = true;
      el.src = url;
    });
  } finally {
    el.onload = el.onloadeddata = el.onerror = null;
    el.removeAttribute('src');
    if (video) el.load();
    URL.revokeObjectURL(url);
  }
}
async function change(event) {
  const el = event.target.closest('[data-wall], #backgroundControls input, #backgroundControls select');
  if (!el || !db || busy || (event.type === 'click') !== !!el.dataset.wall) return;
  const next = { ...prefs };
  let add, remove;
  busy = true;
  const panel = $('#backgroundControls fieldset');
  if (panel) panel.disabled = true;
  try {
    if (el.id === 'wallFile') {
      const file = el.files[0];
      if (!file) return;
      await validateFile(file);
      add = { id: crypto.randomUUID(), name: file.name, type: file.type, created: Date.now(), blob: file };
      next.selected = add.id;
    } else if (el.id === 'wallMode') {
      next.mode = el.value;
      if (next.mode === 'custom' && !next.selected) next.selected = items.at(-1)?.id || '';
    } else if (el.id === 'wallPattern') next.pattern = el.value;
    else if (el.id === 'wallLamp') next.lamp = Number(el.value);
    else if (el.id === 'wallTexture') next.texture = Number(el.value);
    else if (el.dataset.wall === 'select') next.selected = el.dataset.id;
    else if (el.dataset.wall === 'remove') {
      remove = el.dataset.id;
      const i = items.findIndex((f) => f.id === remove);
      if (i < 0) return;
      if (next.selected === remove) next.selected = (items[i - 1] || items[i + 1])?.id || '';
    } else return;
    await commit(next, add, remove);
  } catch (e) {
    reportError(e);
  } finally {
    busy = false;
    drawControls(el.id);
  }
}
document.addEventListener('change', change);
document.addEventListener('click', change);
document.addEventListener('visibilitychange', playback);
reducedMotion.addEventListener('change', playback);
load().catch(reportError);
