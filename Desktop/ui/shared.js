export const $ = (s) => document.querySelector(s);
export const esc = (x) =>
  String(x ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const ico = (n) => '<svg aria-hidden="true"><use href="/icons.svg#' + esc(n) + '"></use></svg>';
export const call = (name, data) => window.desk.call(name, data);
export function icons(root = document) {
  root.querySelectorAll('[data-i]').forEach((el) => {
    el.innerHTML = ico(el.dataset.i);
    el.removeAttribute('data-i');
  });
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', ico(el.dataset.icon));
    el.removeAttribute('data-icon');
  });
}
export const btn = (label, action, icon = '', cls = '', id = '') =>
  '<button class="btn ' +
  cls +
  '" data-act="' +
  esc(action) +
  '" data-id="' +
  esc(id) +
  '">' +
  (icon ? ico(icon) : '') +
  esc(label) +
  '</button>';
export const opt = (v, t, current) =>
  '<option value="' +
  esc(v) +
  '" ' +
  (String(v) === String(current) ? 'selected' : '') +
  '>' +
  esc(t) +
  '</option>';
export const field = (label, id, value = '', type = 'text') =>
  '<label class="field">' +
  esc(label) +
  '<input id="' +
  id +
  '" type="' +
  type +
  '" value="' +
  esc(value) +
  '"></label>';
export const select = (label, id, options, current) =>
  '<label class="field">' +
  esc(label) +
  '<select id="' +
  id +
  '">' +
  options.map(([v, t]) => opt(v, t, current)).join('') +
  '</select></label>';
export const box = (title, icon, body) =>
  '<article class="box"><h3>' + ico(icon) + esc(title) + '</h3>' + body + '</article>';
let toastTimer;
export function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = String(message).replace(/^Error invoking remote method 'desk': (?:Error: )?/, '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}
export const timeLabel = (value) =>
  new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export function avatar() {
  return $('#avatar')?.contentWindow?.companion;
}
export const phase = (p, reduced = false) => {
  avatar()?.setState(p, reduced);
  call('phase', { value: p }).catch(() => {});
};
let seq = 0,
  lastOverlay = 0;
export function mouth(value) {
  const t = performance.now();
  avatar()?.setSpeech(value, t, ++seq);
  if (t - lastOverlay > 40) {
    lastOverlay = t;
    call('level', { value }).catch(() => {});
  }
}
export const timerTime = (f) => {
  const ms = f.ends ? Math.max(0, f.ends - Date.now()) : f.remaining;
  const n = Math.ceil(ms / 1000);
  return (
    Math.floor(n / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (n % 60).toString().padStart(2, '0')
  );
};
