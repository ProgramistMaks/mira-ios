import { mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'ui/vendor');
await mkdir(dir, { recursive: true });
const files = {
  'xlsx.mjs': '@e965/xlsx/xlsx.mjs',
  'cpexcel.full.mjs': '@e965/xlsx/dist/cpexcel.full.mjs',
  'SheetJS-LICENSE.txt': '@e965/xlsx/LICENSE',
  'chess.js': 'chess.js/dist/esm/chess.js',
  'chess-LICENSE.txt': 'chess.js/LICENSE',
  'fflate.js': 'fflate/esm/browser.js',
  'fflate-LICENSE.txt': 'fflate/LICENSE',
  'pdf.min.mjs': 'pdfjs-dist/build/pdf.min.mjs',
  'pdf.worker.min.mjs': 'pdfjs-dist/build/pdf.worker.min.mjs',
  'PDF-LICENSE.txt': 'pdfjs-dist/LICENSE',
};
for (const [target, from] of Object.entries(files))
  await copyFile(path.join(root, 'node_modules', from), path.join(dir, target));
for (const folder of ['cmaps', 'standard_fonts'])
  await cp(path.join(root, 'node_modules/pdfjs-dist', folder), path.join(dir, folder), { recursive: true });
