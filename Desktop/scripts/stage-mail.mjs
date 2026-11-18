// Copy only the runtime dependency tree used by the main-process mail client.
// Preserve npm's nesting so that packages with different versions resolve normally.
import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = process.argv[2],
  visited = new Set();
async function stage(name, from, optional = false) {
  let dir = from;
  let folder;
  while (dir.startsWith(path.resolve(root))) {
    if (path.basename(dir) !== 'node_modules') {
      const next = path.join(dir, 'node_modules', name);
      if (await stat(path.join(next, 'package.json')).catch(() => null)) {
        folder = next;
        break;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!folder) {
    if (optional) return;
    throw Error('Missing mail dependency ' + name);
  }
  if (visited.has(folder)) return;
  visited.add(folder);
  const pkg = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
  const out = path.join(destination, path.relative(root, folder));
  await mkdir(path.dirname(out), { recursive: true });
  await cp(folder, out, { recursive: true, filter: (p) => path.basename(p) !== 'node_modules' });
  for (const child of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }))
    await stage(child, folder, Object.hasOwn(pkg.optionalDependencies || {}, child));
}
for (const name of ['imapflow', 'nodemailer', 'postal-mime', 'html-to-text'])
  await stage(name, path.resolve(root));
