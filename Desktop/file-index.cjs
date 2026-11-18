const fs = require('node:fs/promises'),
  path = require('node:path');
class FileIndex {
  constructor(profile) {
    this.file = path.join(profile, 'file-index.json');
    this.pending = null;
  }
  async prepare(roots, excluded = [], force = false) {
    const key = JSON.stringify([roots.map((r) => r.path), excluded]);
    const before = this.pending || Promise.resolve();
    const task = before
      .catch(() => {})
      .then(() =>
        !force && this.current?.key === key && Date.now() - this.current.time < 86400000
          ? this.current
          : this.build(roots, new Set(excluded), key, force),
      );
    this.pending = task;
    try {
      return await task;
    } finally {
      if (this.pending === task) this.pending = null;
    }
  }
  async build(roots, skip, key, force) {
    if (!force) {
      const cached = await fs
        .readFile(this.file, 'utf8')
        .then(JSON.parse)
        .catch(() => null);
      if (cached?.key === key && Date.now() - cached.time < 86400000 && Array.isArray(cached.rows)) {
        this.current = cached;
        return cached;
      }
    }
    const rows = [],
      queue = roots.map((r) => ({ dir: r.path, root: r }));
    let limited = false;
    for (let i = 0; i < queue.length; i++) {
      const { dir, root } = queue[i];
      if (skip.has(dir)) continue;
      for (const f of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (
          f.name.startsWith('.') ||
          f.isSymbolicLink() ||
          ['node_modules', '$RECYCLE.BIN'].includes(f.name)
        )
          continue;
        const file = path.join(dir, f.name);
        if (f.isDirectory()) {
          if (queue.length < 80000) queue.push({ dir: file, root });
          else limited = true;
        } else if (f.isFile())
          rows.push({ name: f.name, path: file, folder: path.relative(root.path, dir) || root.name });
        if (rows.length >= 200000) {
          limited = true;
          break;
        }
      }
      if (rows.length >= 200000) break;
    }
    const data = { key, rows, time: Date.now(), limited };
    await fs.writeFile(this.file + '.part', JSON.stringify(data), { mode: 0o600 });
    await fs.rename(this.file + '.part', this.file);
    this.current = data;
    return data;
  }
}
module.exports = { FileIndex };
