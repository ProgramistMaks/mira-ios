import { build } from 'esbuild';
import { mkdir, cp, writeFile } from 'node:fs/promises';
import { BODY_CATALOG } from '../Renderer/body.mjs';
import { CHOREOGRAPHY } from '../Renderer/choreography.mjs';
import { CATALOG } from '../Renderer/expression-library.mjs';
await mkdir('Resources/Web', { recursive: true });
await cp('Renderer/public', 'Resources/Web', { recursive: true });
await build({ entryPoints: ['Renderer/avatar.ts'], bundle: true, minify: true,
  outfile: 'Resources/Web/avatar.js', format: 'iife', target: ['safari17'], legalComments: 'linked' });

await writeFile('Resources/Web/expression-catalog.json', JSON.stringify(CATALOG));

await writeFile('Resources/Web/body-catalog.json', JSON.stringify(BODY_CATALOG));

await writeFile('Resources/Web/choreography.json', JSON.stringify({version: 1, clips: CHOREOGRAPHY, emotions: CATALOG.emotions}));
