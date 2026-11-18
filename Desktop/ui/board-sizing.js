import { widgetSize } from './widget-size.mjs';

// Sizes are stored in grid cells, so moving a profile to a narrower display preserves its layout.
export function boardSizing(root, save, redraw, error) {
  let drag;
  function measure(button) {
    const tile = button.closest('.boardTile'),
      grid = tile.closest('.deskGrid');
    const css = getComputedStyle(grid),
      columns = Number(css.getPropertyValue('--columns'));
    const step = (grid.clientWidth + parseFloat(css.columnGap)) / columns;
    const r = tile.getBoundingClientRect();
    return {
      tile,
      id: tile.dataset.tile,
      step,
      columns,
      savedWidth: Number(tile.style.getPropertyValue('--tile-width')),
      width: Math.round((r.width + parseFloat(css.columnGap)) / step),
      height: Math.round((r.height + parseFloat(css.columnGap)) / step),
    };
  }
  function preview(tile, size) {
    tile.classList.add('boardSized');
    tile.style.setProperty('--tile-width', size.width);
    tile.style.setProperty('--tile-height', size.height);
  }
  function resized(m, x, y) {
    return widgetSize(
      m.id,
      !x && m.savedWidth ? m.savedWidth : Math.min(m.columns, m.width + x),
      m.height + y,
    );
  }
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-act=boardResize]');
    if (!b || e.button !== 0 || drag) return;
    e.preventDefault();
    const m = measure(b);
    m.tile.draggable = false;
    b.setPointerCapture(e.pointerId);
    drag = { ...m, button: b, pointer: e.pointerId, x: e.clientX, y: e.clientY };
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dx = Math.round((e.clientX - drag.x) / drag.step),
      dy = Math.round((e.clientY - drag.y) / drag.step);
    if (!dx && !dy && !drag.size) return;
    const size = resized(drag, dx, dy);
    if (drag.size?.width === size.width && drag.size?.height === size.height) return;
    drag.size = size;
    preview(drag.tile, size);
  });
  async function finish(e) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    drag = undefined;
    d.tile.draggable = true;
    if (d.button.hasPointerCapture(d.pointer)) d.button.releasePointerCapture(d.pointer);
    try {
      if (e.type === 'pointerup' && d.size && (d.width !== d.size.width || d.height !== d.size.height))
        await save(d.id, d.size);
    } catch (err) {
      error(err);
    }
    redraw();
  }
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  root.addEventListener('lostpointercapture', finish);
  root.addEventListener('keydown', async (e) => {
    const b = e.target.closest('[data-act=boardResize]');
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!b || !delta) return;
    e.preventDefault();
    const m = measure(b),
      size = resized(m, ...delta);
    try {
      await save(m.id, size);
    } catch (err) {
      error(err);
    }
  });
  return () => !!drag;
}
