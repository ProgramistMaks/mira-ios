const keyMap = {
  ArrowUp: 'UPARROW',
  ArrowDown: 'DOWNARROW',
  ArrowLeft: 'LEFTARROW',
  ArrowRight: 'RIGHTARROW',
  w: 'UPARROW',
  s: 'DOWNARROW',
  a: 'STRAFE_L',
  d: 'STRAFE_R',
  Control: 'FIRE',
  ' ': 'USE',
  Shift: 'SHIFT',
  Tab: 'TAB',
  Escape: 'ESCAPE',
  Enter: 'ENTER',
  Backspace: 'BACKSPACE',
  Alt: 'ALT',
};
export async function open(panel) {
  panel.innerHTML =
    '<canvas id="doomCanvas" tabindex="0" aria-label="Freedoom"></canvas><p id="state">Загрузка уровня…</p><small>Стрелки или WASD — движение · Ctrl — огонь · пробел — действие · Esc — меню и сохранения</small>';
  const canvas = panel.querySelector('canvas'),
    ctx = canvas.getContext('2d'),
    state = panel.querySelector('#state');
  const [wasm, wad] = await Promise.all(
    ['game.wasm', 'freedoom2.wad'].map(async (file) => {
      const r = await fetch('/game/' + file);
      if (!r.ok) throw Error('Файл игры недоступен');
      return new Uint8Array(await r.arrayBuffer());
    }),
  );
  let api,
    pixels,
    ticks = 0;
  const keys = new Set(),
    storage = (slot) => 'mira-freedoom-' + slot;
  function setInt(p, n) {
    new DataView(api.memory.buffer).setUint32(p, n, true);
  }
  const { instance } = await WebAssembly.instantiate(wasm, {
    loading: {
      onGameInit: (w, h) => {
        canvas.width = w;
        canvas.height = h;
        pixels = ctx.createImageData(w, h);
      },
      wadSizes: (n, len) => {
        setInt(n, 1);
        setInt(len, wad.length);
      },
      readWads: (p, s) => {
        new Uint8Array(api.memory.buffer, p, wad.length).set(wad);
        setInt(s, wad.length);
      },
    },
    ui: {
      drawFrame: (p) => {
        const b = new Uint32Array(api.memory.buffer, p, canvas.width * canvas.height),
          out = new Uint32Array(pixels.data.buffer);
        for (let i = 0; i < b.length; i++) {
          const c = b[i];
          out[i] = 0xff000000 | (c & 0xff00) | ((c & 255) << 16) | ((c >> 16) & 255);
        }
        ctx.putImageData(pixels, 0, 0);
        canvas.dataset.frames = String(++ticks);
      },
    },
    runtimeControl: { timeInMilliseconds: () => BigInt(Math.floor(performance.now())) },
    console: {
      onInfoMessage: () => {},
      onErrorMessage: (p, n) => {
        state.textContent = new TextDecoder().decode(new Uint8Array(api.memory.buffer, p, n));
      },
    },
    gameSaving: {
      sizeOfSaveGame: (slot) => Uint8Array.fromBase64(localStorage.getItem(storage(slot)) || '').length,
      readSaveGame: (slot, p) => {
        const b = Uint8Array.fromBase64(localStorage.getItem(storage(slot)) || '');
        new Uint8Array(api.memory.buffer, p, b.length).set(b);
        return b.length;
      },
      writeSaveGame: (slot, p, n) => {
        try {
          localStorage.setItem(storage(slot), new Uint8Array(api.memory.buffer, p, n).toBase64());
          return n;
        } catch {
          return 0;
        }
      },
    },
  });
  api = instance.exports;
  api.initGame();
  state.textContent = 'Enter — начать игру';
  canvas.focus();
  function code(e) {
    return keyMap[e.key]
      ? api['KEY_' + keyMap[e.key]].value
      : e.key.length === 1
        ? e.key.toLowerCase().charCodeAt(0)
        : null;
  }
  window.addEventListener('keydown', (e) => {
    const k = code(e);
    if (k == null) return;
    e.preventDefault();
    if (!keys.has(k)) {
      keys.add(k);
      api.reportKeyDown(k);
    }
    state.textContent = 'Freedoom · Phase 2';
  });
  window.addEventListener('keyup', (e) => {
    const k = code(e);
    if (k != null) {
      e.preventDefault();
      keys.delete(k);
      api.reportKeyUp(k);
    }
  });
  window.addEventListener('blur', () => {
    for (const k of keys) api.reportKeyUp(k);
    keys.clear();
  });
  const timer = setInterval(() => {
    if (!document.hidden) api.tickGame();
  }, 1000 / 35);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
