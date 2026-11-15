import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../Resources/Web/', import.meta.url);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const files = { '/': ['index.html', 'text/html'], '/avatar.js': ['avatar.js', 'application/javascript'],
    '/character.vrm': ['character.vrm', 'model/gltf-binary'] };
  const entry = files[path];
  if (!entry) { response.writeHead(404); response.end(); return; }
  try {
    response.setHeader('Content-Type', entry[1]);
    response.end(await readFile(new URL(entry[0], root)));
  } catch { response.writeHead(500); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errors = []; const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1') && !request.url().startsWith('blob:')) external.push(request.url()); });
  const address = `http://127.0.0.1:${server.address().port}`;
  await page.goto(address);
  await page.waitForFunction(() => window.companion?.ready === true, undefined, { timeout: 30000 });
  await page.evaluate(() => { document.body.style.background = '#0e0e13'; });
  await mkdir('/tmp/companion-review', { recursive: true });
  for (const [width, height] of [[390, 420], [700, 800], [300, 400]]) {
    await page.setViewportSize({ width, height });
    for (const phase of ['idle', 'listening', 'thinking', 'speaking']) {
      await page.evaluate(phase => window.companion.setState(phase, false), phase);
      assert.equal(await page.evaluate(() => window.companion.phase), phase);
    }
    await page.evaluate(() => window.companion.setState('idle', true));
    await page.screenshot({ path: `/tmp/companion-review/avatar-${width}.png` });
    assert.equal(await page.locator('canvas').count(), 1);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  // A broken model must produce an explicit error, never a fake ready state.
  const broken = await browser.newPage();
  await broken.route('**/character.vrm', route => route.abort());
  await broken.goto(address);
  await broken.waitForFunction(() => document.documentElement.dataset.status === 'error');
  assert.equal(await broken.evaluate(() => window.companion.ready), false);
  console.log('PASS: VRM loads; all four states; three sizes; no external fetches; explicit missing-model error. Chromium only, not WKWebView/device QA.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
