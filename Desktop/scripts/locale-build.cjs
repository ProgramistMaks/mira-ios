// Translate authored UI literals at build time. Input fields, filenames, chat and plugin content never pass through this catalog.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const ui = path.join(__dirname, '../ui');
const phrases = /[А-Яа-яЁё]+(?:[ \u00a0.,!?«»—–:()\/…-]+[А-Яа-яЁё]+)*/gu;
const catalogFile = path.join(ui, 'english.json');
function localized(file, source, catalog, collect) {
  function convert(text) {
    return (
      catalog[text] ??
      text.replace(phrases, (key) => {
        collect?.add(key);
        return catalog[key] ?? key;
      })
    );
  }
  if (
    ['wake.mjs', 'voice-signal.mjs', 'note-format.mjs', 'chat-formats.mjs', 'calendar-dates.mjs'].includes(
      file,
    )
  )
    return source;
  if (file.endsWith('.html'))
    return convert(source)
      .replace('<html lang="ru">', '<html lang="en">')
      .replace(/(<script\b[^>]*\bsrc=")([a-z-]+\.js)"/g, '$1/en/$2"');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function walk(node) {
    if (ts.isStringLiteralLike(node)) {
      const original = node.text;
      if (original === 'ru-RU' || original === 'ru') {
        // Preserve preference values and voice locales. Only date/number formatters use the UI language.
        const call = node.parent;
        if (
          (ts.isCallExpression(call) || ts.isNewExpression(call)) &&
          /(?:toLocale\w*|Intl\.\w+)$/.test(call.expression.getText(tree))
        )
          edits.push([node.getStart(tree), node.end, '"en-US"']);
      } else if (/[А-Яа-яЁё]/.test(original) && !['Русский', 'English'].includes(original)) {
        const translated = convert(original);
        if (original !== translated) edits.push([node.getStart(tree), node.end, JSON.stringify(translated)]);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(tree);
  for (const [i, j, text] of edits.reverse()) source = source.slice(0, i) + text + source.slice(j);
  return source;
}
function build(target, collect = false) {
  const keys = new Set();
  const catalog = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile)) : {};
  if (!collect) fs.mkdirSync(target, { recursive: true });
  for (const f of fs.readdirSync(ui).filter((f) => /\.(?:html|m?js)$/.test(f))) {
    const src = fs.readFileSync(path.join(ui, f), 'utf8'),
      en = localized(f, src, catalog, keys);
    if (!collect && en !== src) fs.writeFileSync(path.join(target, f), en);
  }
  if (collect)
    for (const f of fs.readdirSync(path.join(ui, '..')).filter((f) => f.endsWith('.cjs'))) {
      const src = fs.readFileSync(path.join(ui, '..', f), 'utf8'),
        tree = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      function native(node) {
        if (ts.isStringLiteralLike(node) && /[А-Яа-яЁё]/.test(node.text)) {
          const n = node.parent;
          if (
            (ts.isCallExpression(n) && n.expression.getText(tree) === 'Error') ||
            (ts.isPropertyAssignment(n) && ['label', 'name', 'detail'].includes(n.name.getText(tree)))
          )
            keys.add(node.text);
        }
        ts.forEachChild(node, native);
      }
      native(tree);
    }
  if (collect) fs.writeFileSync(target, JSON.stringify([...keys]));
}
if (require.main === module) build(process.argv[2], process.argv[3] === '--collect');
module.exports = { localized };
