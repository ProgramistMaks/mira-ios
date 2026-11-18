const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function cacheFolders(profile, windowsLocal) {
  const dirs = [
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'GrShaderCache',
    'ShaderCache',
  ];
  const roots = dirs.map((id) => ({ id, dir: path.join(profile, id) }));
  if (windowsLocal) {
    roots.push({ id: 'DirectX', dir: path.join(windowsLocal, 'D3DSCache') });
    for (const [browser, vendor] of [
      ['Chrome', 'Google/Chrome'],
      ['Edge', 'Microsoft/Edge'],
    ]) {
      const base = path.join(windowsLocal, vendor, 'User Data');
      roots.push({
        browser,
        base,
        profiles: /^(?:Default|Profile \d+)$/,
        caches: ['Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache'],
      });
    }
    roots.push({
      browser: 'Firefox',
      base: path.join(windowsLocal, 'Mozilla', 'Firefox', 'Profiles'),
      profiles: /^[\w.-]+$/,
      caches: ['cache2', 'startupCache'],
    });
  }
  return roots;
}
class CacheCleaner {
  constructor(roots) {
    this.roots = roots;
  }
  async preview() {
    const entries = [];
    let unreadable = 0;
    const folders = [];
    for (const root of this.roots) {
      if (!root.browser) {
        folders.push(root);
        continue;
      }
      try {
        if (path.relative(root.base, await fs.realpath(root.base))) continue;
        for (const entry of await fs.readdir(root.base, { withFileTypes: true })) {
          if (!entry.isDirectory() || !root.profiles.test(entry.name)) continue;
          for (const cache of root.caches)
            folders.push({
              id: root.browser + ' / ' + entry.name + ' / ' + cache,
              dir: path.join(root.base, entry.name, cache),
            });
        }
      } catch (e) {
        if (e.code !== 'ENOENT') unreadable++;
      }
    }
    for (const { id, dir } of folders) {
      async function visit(folder) {
        let children;
        try {
          if ((await fs.lstat(folder)).isSymbolicLink() || path.relative(folder, await fs.realpath(folder)))
            return;
          children = await fs.readdir(folder, { withFileTypes: true });
        } catch (e) {
          if (e.code !== 'ENOENT') unreadable++;
          return;
        }
        for (const item of children) {
          const file = path.join(folder, item.name);
          if (item.isDirectory()) await visit(file);
          else if (item.isFile()) {
            try {
              const stat = await fs.lstat(file);
              if (stat.isFile())
                entries.push({
                  id,
                  file,
                  dir,
                  name: path.relative(dir, file),
                  size: stat.size,
                  mtime: stat.mtimeMs,
                  ino: stat.ino,
                });
            } catch {
              unreadable++;
            }
          }
        }
      }
      await visit(dir);
    }
    const token = randomUUID();
    this.plan = { token, entries };
    return { token, unreadable, files: entries.map(({ id, name, size }) => ({ id, name, size })) };
  }
  async remove(token, groups) {
    if (!this.plan || token !== this.plan.token || !Array.isArray(groups))
      throw Error('Обнови предварительный просмотр');
    const { entries } = this.plan;
    this.plan = null;
    let files = 0,
      bytes = 0,
      skipped = 0;
    for (const row of entries.filter((x) => groups.includes(x.id))) {
      try {
        if (path.relative(row.file, await fs.realpath(row.file))) {
          skipped++;
          continue;
        }
        const s = await fs.lstat(row.file);
        if (!s.isFile() || s.size !== row.size || s.mtimeMs !== row.mtime || s.ino !== row.ino) {
          skipped++;
          continue;
        }
        await fs.unlink(row.file);
        files++;
        bytes += s.size;
      } catch {
        skipped++;
      }
    }
    return { files, bytes, skipped };
  }
}
module.exports = { CacheCleaner, cacheFolders };
