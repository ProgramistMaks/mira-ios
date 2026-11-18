import { Chess } from './vendor/chess.js';
const value = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function evaluate(game) {
  let score = 0;
  for (const row of game.board())
    for (const p of row) {
      if (!p) continue;
      const x = p.square.charCodeAt(0) - 97,
        y = +p.square[1] - 1;
      const centre = 3.5 - (Math.abs(3.5 - x) + Math.abs(3.5 - y)) / 2,
        development =
          p.type === 'p' ? (p.color === 'w' ? y : 7 - y) * 5 : ['n', 'b'].includes(p.type) ? centre * 8 : 0;
      score += (value[p.type] + development) * (p.color === 'w' ? 1 : -1);
    }
  return score * (game.turn() === 'w' ? 1 : -1);
}
onmessage = ({ data }) => {
  const game = new Chess(data.fen),
    all = game.moves({ verbose: true });
  if (!all.length) return;
  const depth = Number(data.level),
    deadline = performance.now() + (depth === 3 ? 1050 : 420);
  if (depth === 1) {
    postMessage(all[Math.floor(Math.random() * all.length)].lan);
    return;
  }
  let expired = false,
    best = all[0];
  function search(left, alpha, beta) {
    if (performance.now() > deadline) {
      expired = true;
      return 0;
    }
    if (!left) return evaluate(game);
    const moves = game.moves({ verbose: true });
    if (!moves.length) return game.isCheck() ? -90000 - left : 0;
    moves.sort((a, b) => (value[b.captured] || 0) - (value[a.captured] || 0));
    for (const m of moves) {
      game.move(m);
      const n = -search(left - 1, -beta, -alpha);
      game.undo();
      if (expired) return 0;
      if (n >= beta) return beta;
      alpha = Math.max(n, alpha);
    }
    return alpha;
  }
  for (let d = 1; d <= depth; d++) {
    let score = -Infinity,
      pick = best;
    all.sort((a, b) => Number(b.lan === best.lan) - Number(a.lan === best.lan));
    for (const m of all) {
      game.move(m);
      const n = -search(d - 1, -100001, -score);
      game.undo();
      if (expired) break;
      if (n > score) {
        score = n;
        pick = m;
      }
    }
    if (expired) break;
    best = pick;
  }
  postMessage(best.lan);
};
