const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const limit = 512 * 1024;
const extensions = new Set(
  'txt md csv json yaml yml toml css html htm js jsx mjs cjs ts tsx py rb rs swift c h cpp hpp java kt go cs sql xml'.split(
    ' ',
  ),
);
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function inside(root, file) {
  const rel = path.relative(root, file);
  return rel && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);
}
async function resolveFile(root, name) {
  if (
    !root ||
    typeof name !== 'string' ||
    path.isAbsolute(name) ||
    name.split(/[\\/]/).some((p) => !p || p === '..' || p.startsWith('.')) ||
    !extensions.has(path.extname(name).slice(1).toLowerCase())
  )
    throw Error('Выбери текстовый файл проекта');
  const base = await fs.realpath(root),
    file = path.resolve(base, name),
    actual = await fs.realpath(file);
  if (!inside(base, actual) || path.relative(file, actual) !== '') throw Error('Файл за пределами проекта');
  const info = await fs.stat(file);
  if (!info.isFile() || info.size > limit) throw Error('Предел редактора — 512 КБ');
  return { file, mode: info.mode };
}
async function list(root) {
  if (!root) throw Error('Выбери рабочую папку');
  const dirs = [''],
    files = [];
  let truncated = false;
  for (let i = 0; i < dirs.length; i++) {
    const entries = await fs.readdir(path.join(root, dirs[i]), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.isSymbolicLink() ||
        ['node_modules', 'build', 'dist', 'target'].includes(entry.name)
      )
        continue;
      const name = path.join(dirs[i], entry.name);
      if (entry.isDirectory()) {
        if (dirs.length < 500) dirs.push(name);
        else truncated = true;
      }
      if (entry.isFile() && extensions.has(path.extname(name).slice(1).toLowerCase())) files.push(name);
      if (files.length >= 1000) return { files: files.sort(), truncated: true };
    }
  }
  return { files: files.sort(), truncated };
}
async function read(root, name) {
  const { file } = await resolveFile(root, name),
    bytes = await fs.readFile(file);
  if (bytes.length > limit || bytes.includes(0)) throw Error('Требуется текст UTF-8');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  return { name, text, revision: hash(bytes) };
}
const busy = new Set();
async function save(root, { name, text, revision }) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > limit) throw Error('Предел редактора — 512 КБ');
  const { file, mode } = await resolveFile(root, name);
  if (busy.has(file)) throw Error('Файл сохраняется');
  busy.add(file);
  const tmp = path.join(path.dirname(file), '.mira-' + randomUUID());
  try {
    await fs.writeFile(tmp, text, { flag: 'wx', mode });
    if ((await read(root, name)).revision !== revision)
      throw Error('Файл изменился на диске. Открой его заново.');
    await fs.rename(tmp, file);
    return { name, revision: hash(text) };
  } finally {
    busy.delete(file);
    await fs.rm(tmp, { force: true });
  }
}
module.exports = { list, read, save };
