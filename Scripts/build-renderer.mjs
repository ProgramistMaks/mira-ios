import { build } from 'esbuild';
import { mkdir, cp, writeFile } from 'node:fs/promises';
import { CATALOG } from '../Renderer/expression-library.mjs';
await mkdir('Resources/Web', { recursive: true });
await cp('Renderer/public', 'Resources/Web', { recursive: true });
await build({ entryPoints: ['Renderer/avatar.ts'], bundle: true, minify: true,
  outfile: 'Resources/Web/avatar.js', format: 'iife', target: ['safari17'], legalComments: 'linked' });

await writeFile('Resources/Web/expression-catalog.json', JSON.stringify(CATALOG));
