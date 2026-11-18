import { $, ico } from './shared.js';
import { availableTabs, pinnedTabs } from './nav-layout.mjs';

export function navigation(names, icons, save, onError) {
  const tabs = $('#tabs'),
    panel = $('#navMenu'),
    toggle = $('#navMenuButton');
  let pinned = [],
    active,
    dragId,
    saving = false;
  const icon = (id) => ico(icons[id] || 'layout-dashboard');
  const placeIndicator = () => {
    const tab = tabs.querySelector('[aria-current="page"]');
    const indicator = $('#tabIndicator');
    if (!indicator) return;
    indicator.hidden = !tab;
    if (tab) {
      indicator.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
      indicator.style.width = tab.offsetWidth + 'px';
    }
  };
  function renderRows() {
    for (const [list, ids, fixed] of [
      [$('#pinnedNav'), pinned, true],
      [$('#availableNav'), availableTabs.filter((id) => !pinned.includes(id)), false],
    ]) {
      list.innerHTML = ids
        .map((id) => {
          const locked = id === 'home';
          const label = (fixed ? 'Открепить от панели' : 'Закрепить в панели') + ' · ' + names[id];
          return (
            '<div class="navRow" data-id="' +
            id +
            '">' +
            '<button class="navGrip" ' +
            (fixed && !locked
              ? 'draggable="true" title="Изменить порядок · Alt + ↑ / ↓" aria-label="Переместить ' +
                names[id] +
                '"'
              : 'hidden') +
            '>' +
            ico('grip-vertical') +
            '</button>' +
            '<button class="navDest" data-go="' +
            id +
            '">' +
            icon(id) +
            names[id] +
            '</button>' +
            '<button class="navPin" data-pin="' +
            id +
            '" aria-pressed="' +
            fixed +
            '" title="' +
            label +
            '" aria-label="' +
            label +
            '"' +
            (locked ? ' disabled' : '') +
            '>' +
            ico('pin') +
            '</button></div>'
          );
        })
        .join('');
    }
  }
  function update(value, page) {
    const next = pinnedTabs(value);
    const changed = String(next) !== String(pinned);
    if (changed) {
      pinned = next;
      tabs.innerHTML =
        '<span id="tabIndicator" aria-hidden="true"></span>' +
        pinned.map((id) => '<button data-go="' + id + '">' + icon(id) + names[id] + '</button>').join('');
      renderRows();
    }
    const selected = page === 'desk' && !pinned.includes('desk') ? 'home' : page;
    for (const button of [...tabs.querySelectorAll('button'), ...panel.querySelectorAll('[data-go]')]) {
      const selectedHere = button.dataset.go === (tabs.contains(button) ? selected : page);
      if (selectedHere) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if (changed || active !== page) {
      const el = tabs.querySelector('[aria-current]');
      if (el && tabs.scrollWidth > tabs.clientWidth)
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      placeIndicator();
    }
    active = page;
  }
  async function persist(next, selector) {
    if (saving || String(next) === String(pinned)) return;
    saving = true;
    try {
      await save({ navTabs: next });
      if (panel.matches(':popover-open')) panel.querySelector(selector)?.focus({ preventScroll: true });
    } catch (e) {
      onError(e);
    } finally {
      saving = false;
    }
  }
  function move(id, index) {
    const from = pinned.indexOf(id);
    if (from < 1 || index < 1 || index >= pinned.length) return;
    const next = [...pinned];
    next.splice(from, 1);
    next.splice(index, 0, id);
    return persist(next, '.navRow[data-id="' + id + '"] .navGrip');
  }
  panel.addEventListener('click', (event) => {
    const pin = event.target.closest('[data-pin]')?.dataset.pin;
    if (!pin || pin === 'home') return;
    persist(
      pinned.includes(pin) ? pinned.filter((id) => id !== pin) : [...pinned, pin],
      '[data-pin="' + pin + '"]',
    );
  });
  panel.addEventListener('keydown', (event) => {
    const row = event.target.closest('.navRow');
    if (!row || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    move(row.dataset.id, pinned.indexOf(row.dataset.id) + (event.key === 'ArrowUp' ? -1 : 1));
  });
  panel.addEventListener('dragstart', (event) => {
    if (!event.target.closest('.navGrip')) return;
    dragId = event.target.closest('.navRow').dataset.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragId);
  });
  panel.addEventListener('dragover', (event) => {
    if (dragId && event.target.closest('#pinnedNav .navRow:not([data-id="home"])')) event.preventDefault();
  });
  panel.addEventListener('drop', (event) => {
    const row = event.target.closest('#pinnedNav .navRow');
    if (!dragId || !row) return;
    event.preventDefault();
    move(dragId, pinned.indexOf(row.dataset.id));
    dragId = null;
  });
  panel.addEventListener('dragend', () => {
    dragId = null;
  });
  panel.addEventListener('beforetoggle', (event) =>
    toggle.setAttribute('aria-expanded', String(event.newState === 'open')),
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && panel.matches(':popover-open')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        panel.hidePopover();
        toggle.focus();
      }
    },
    true,
  );
  const sizeChanged = () => {
    placeIndicator();
    if (tabs.scrollWidth > tabs.clientWidth)
      tabs.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  new ResizeObserver(sizeChanged).observe(tabs);
  document.fonts.ready.then(sizeChanged);
  return update;
}
