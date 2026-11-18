// Keep effect lifetimes independent of model updates and renderer refreshes.
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
const running = new Set();
let navigation,
  routeRevision = 0;
export const motionEnabled = () =>
  !systemMotion.matches && !document.documentElement.hasAttribute('data-still');
function stopEffects() {
  if (motionEnabled()) return;
  for (const animation of running) animation.cancel();
  navigation?.skipTransition();
}
systemMotion.addEventListener('change', stopEffects);
export function setReduced(value) {
  document.documentElement.toggleAttribute('data-still', !!value);
  stopEffects();
}
const out = 'cubic-bezier(.23,1,.32,1)';
function play(el, frames, duration, easing) {
  const animation = el.animate(frames, { duration, easing });
  running.add(animation);
  const remove = () => running.delete(animation);
  animation.finished.then(remove, remove);
  return animation;
}
export function appear(el, from, duration = 200, easing = out) {
  if (!el || !motionEnabled()) return;
  const end = Object.fromEntries(Object.keys(from).map((k) => [k, k === 'opacity' ? 1 : 'none']));
  return play(el, [from, end], duration, easing);
}
export function changeSurface(kind, update) {
  const revision = ++routeRevision;
  navigation?.skipTransition();
  if (!document.startViewTransition || !motionEnabled()) return update();
  const root = document.documentElement;
  root.dataset.surfaceMotion = kind;
  const current = document.startViewTransition(() => {
    if (revision === routeRevision) update();
  });
  navigation = current;
  current.finished
    .finally(() => {
      if (navigation === current) {
        navigation = null;
        delete root.dataset.surfaceMotion;
      }
    })
    .catch(() => {});
}
function enterRow(el) {
  const soften = 'cubic-bezier(.16,1,.3,1)';
  if (el.matches('.flowNode'))
    return play(
      el,
      [
        { opacity: 0, scale: '.82' },
        { opacity: 1, scale: '1.03', offset: 0.7 },
        { opacity: 1, scale: '1' },
      ],
      280,
      soften,
    );
  if (el.matches('.orgRow'))
    return appear(
      el,
      { opacity: 0, translate: '0 -4px' },
      el.closest('[data-main-list]')?.querySelector('#noteBody') ? 350 : 220,
      soften,
    );
  if (el.matches('.orgTask, .widgetTask'))
    return appear(el, { opacity: 0, translate: '0 2px', scale: '.98' }, 350, soften);
  if (el.matches('.reminderGrid article,.agendaRow'))
    return appear(el, { opacity: 0, scale: '.98' }, 350, soften);
  return appear(el, { opacity: 0, translate: '10px 0' }, 220);
}
// The same records can be rendered many times while background services are updating.
export function rowChanges(host, selector, group) {
  const key = (el) =>
    el.dataset.motionId ??
    el.dataset.id ??
    el.dataset.tile ??
    el.dataset.node ??
    el.querySelector('[data-id]')?.dataset.id;
  const elements = () => [...host.querySelectorAll(selector)].filter((el) => key(el) != null);
  const sameGroup = host.dataset.motionGroup === String(group);
  host.dataset.motionGroup = String(group);
  if (!sameGroup || !motionEnabled() || !host.getClientRects().length) return () => {};
  const previous = new Map(
    elements().map((el) => [
      key(el),
      {
        rect: el.getBoundingClientRect(),
        element: el,
        done: el.classList.contains('done'),
      },
    ]),
  );
  return () => {
    for (const el of elements()) {
      const item = previous.get(key(el));
      previous.delete(key(el));
      if (!item) enterRow(el);
      else if (item.done !== el.classList.contains('done'))
        appear(el.querySelector('button') || el, { scale: '.78' }, 300, 'cubic-bezier(.34,1.42,.7,1)');
      else {
        const rect = el.getBoundingClientRect();
        const dx = item.rect.left - rect.left,
          dy = item.rect.top - rect.top;
        if (dx || dy) appear(el, { translate: dx + 'px ' + dy + 'px' }, 200);
      }
    }
    for (const { rect, element } of previous.values()) {
      if (!rect.width || !rect.height) continue;
      const ghost = document.createElement('div');
      ghost.className = 'motionDeparture';
      ghost.ariaHidden = 'true';
      ghost.inert = true;
      // Use the old pixels' content without leaving duplicate IDs or live controls in the document.
      const visual = element.cloneNode(true);
      for (const node of [visual, ...visual.querySelectorAll('*')]) {
        node.removeAttribute('id');
        for (const key of Object.keys(node.dataset)) delete node.dataset[key];
      }
      ghost.append(visual);
      const layer = host.closest('dialog[open], :popover-open') || document.body;
      layer.append(ghost);
      Object.assign(ghost.style, {
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
      });
      const exit = play(
        ghost,
        [
          { opacity: 1, scale: '1' },
          { opacity: 0, scale: element.matches('.orgRow') ? '1' : '.98' },
        ],
        150,
        out,
      );
      const clean = () => {
        running.delete(exit);
        ghost.remove();
      };
      exit.finished.then(clean, clean);
    }
  };
}
export function streamText(el, prior, next) {
  if (!next.startsWith(prior) || !motionEnabled()) {
    el.textContent = next;
    return;
  }
  if (!prior) el.replaceChildren();
  const delta = next.slice(prior.length);
  if (!delta) return;
  const span = document.createElement('span');
  span.textContent = delta;
  el.append(span);
  const finish = () => {
    const prev = span.previousSibling;
    if (prev?.nodeType === Node.TEXT_NODE) {
      prev.appendData(delta);
      span.remove();
    } else span.replaceWith(document.createTextNode(delta));
  };
  const animation = appear(span, { opacity: 0 }, 600, 'linear');
  animation.finished.then(finish, finish);
}

// Animate only digits that actually changed, retaining one accessible text value.
export function rollingNumber(el, value) {
  const old = el.textContent;
  if (old === value) return;
  if (!motionEnabled() || old.length !== value.length || !el.getClientRects().length) {
    el.textContent = value;
    return;
  }
  el.replaceChildren(
    ...Array.from(value, (char, i) => {
      if (char === old[i] || !/\d/.test(char)) return document.createTextNode(char);
      const clip = document.createElement('span');
      clip.className = 'rollingDigit';
      const current = document.createElement('span');
      current.textContent = char;
      current.dataset.previous = old[i];
      clip.append(current);
      return clip;
    }),
  );
}
