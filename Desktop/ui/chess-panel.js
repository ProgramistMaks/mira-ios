import { Chess } from './vendor/chess.js';
const symbols = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
  russian = { k: 'король', q: 'ферзь', r: 'ладья', b: 'слон', n: 'конь', p: 'пешка' };
export function open(root) {
  root.innerHTML =
    '<div id="tools"><select id="side" aria-label="Сторона"><option value="w">За белых</option><option value="b">За чёрных</option></select><select id="level" aria-label="Сложность"><option value="1">Легко</option><option value="2">Обычно</option><option value="3">Сложно</option></select><button id="undo">Ход назад</button><button id="new">Новая партия</button></div><div id="board" aria-label="Шахматная доска"></div><span id="state"></span><div id="promotion" hidden></div>';
  const get = (id) => root.querySelector('#' + id),
    g = new Chess(),
    board = get('board');
  let side = 'w',
    level = 2,
    selected = '',
    worker,
    choosing = false;
  try {
    const save = JSON.parse(localStorage.getItem('mira-chess') || 'null');
    if (save) {
      for (const move of save.moves) g.move(move);
      side = save.side === 'b' ? 'b' : 'w';
      level = [1, 2, 3].includes(save.level) ? save.level : 2;
    }
  } catch {
    g.reset();
  }
  function save() {
    localStorage.setItem('mira-chess', JSON.stringify({ moves: g.history(), side, level }));
  }
  function stop() {
    worker?.terminate();
    worker = null;
    choosing = false;
    get('promotion').hidden = true;
    selected = '';
  }
  function paint() {
    const legal = new Set(selected ? g.moves({ square: selected, verbose: true }).map((m) => m.to) : []);
    board.replaceChildren();
    const files = side === 'w' ? 'abcdefgh' : 'hgfedcba',
      ranks = side === 'w' ? '87654321' : '12345678';
    for (const r of ranks)
      for (const f of files) {
        const sq = f + r,
          p = g.get(sq),
          b = document.createElement('button');
        b.dataset.square = sq;
        b.type = 'button';
        b.title = sq + (p ? ' · ' + russian[p.type] : '');
        b.setAttribute('aria-label', b.title);
        b.className = [
          (f.charCodeAt(0) - 97 + Number(r)) % 2 ? 'dark' : '',
          p?.color === 'w' ? 'white' : '',
          sq === selected ? 'selected' : '',
          legal.has(sq) ? 'legal' : '',
        ].join(' ');
        b.textContent = p ? symbols[p.type] : '';
        board.append(b);
      }
    get('side').value = side;
    get('level').value = String(level);
    get('undo').disabled = !g.history().length;
    get('state').textContent = g.isCheckmate()
      ? g.turn() === side
        ? 'Мат. Мира выиграла.'
        : 'Мат. Ты выиграл!'
      : g.isDraw()
        ? 'Ничья'
        : g.turn() === side
          ? g.isCheck()
            ? 'Шах. Твой ход.'
            : 'Твой ход'
          : 'Мира обдумывает ход…';
  }
  function after() {
    selected = '';
    save();
    paint();
    if (g.isGameOver() || g.turn() === side) return;
    worker = new Worker('/chess-player.js', { type: 'module' });
    const active = worker;
    worker.onmessage = (e) => {
      if (active !== worker) return;
      stop();
      g.move(e.data);
      save();
      paint();
    };
    worker.onerror = () => {
      if (active === worker) {
        stop();
        get('state').textContent = 'Не удалось рассчитать ход';
      }
    };
    worker.postMessage({ fen: g.fen(), level });
  }
  function move(to, promotion) {
    g.move({ from: selected, to, promotion });
    choosing = false;
    get('promotion').hidden = true;
    after();
  }
  board.onclick = (e) => {
    const sq = e.target.closest('[data-square]')?.dataset.square;
    if (!sq || g.turn() !== side || choosing || g.isGameOver()) return;
    const possible = selected
      ? g.moves({ square: selected, verbose: true }).filter((m) => m.to === sq)
      : [];
    if (possible[0]?.promotion) {
      choosing = true;
      const choices = get('promotion');
      choices.hidden = false;
      choices.replaceChildren();
      for (const p of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.textContent = russian[p];
        b.onclick = () => move(sq, p);
        choices.append(b);
      }
      return;
    }
    if (possible.length) {
      move(sq);
      return;
    }
    selected = g.get(sq)?.color === side && sq !== selected ? sq : '';
    paint();
  };
  get('new').onclick = () => {
    stop();
    g.reset();
    after();
  };
  get('side').onchange = (e) => {
    stop();
    side = e.target.value;
    g.reset();
    after();
  };
  get('level').onchange = (e) => {
    stop();
    level = +e.target.value;
    after();
  };
  get('undo').onclick = () => {
    stop();
    if (g.undo() && g.turn() !== side && g.history().length) g.undo();
    after();
  };
  window.addEventListener('pagehide', stop);
  after();
}
