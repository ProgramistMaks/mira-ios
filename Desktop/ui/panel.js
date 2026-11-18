const game = new URLSearchParams(location.search).get('game');
const modules = { chess: './chess-panel.js', shadow: './shadow-panel.js', freedoom: './doom-panel.js' };
if (Object.hasOwn(modules, game))
  import(modules[game])
    .then((m) => m.open(document.querySelector('#panel')))
    .catch((e) => (document.querySelector('#problem').textContent = e.message));
