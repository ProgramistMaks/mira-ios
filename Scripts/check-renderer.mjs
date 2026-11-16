import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { speechProbeBundle, checkSpeech } from './check-speech.mjs';

const root = new URL('../Resources/Web/', import.meta.url);
const speechProbe = await speechProbeBundle();
const morphProbe = await build({ entryPoints: ['Scripts/check-morphs.mjs'], bundle: true,
  write: false, format: 'esm', target: ['chrome120'] });
const stanceProbe = await build({ entryPoints: ['Scripts/check-stance.mjs'], bundle: true,
  write: false, format: 'esm', target: ['chrome120'] });
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/check-morphs.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.end(morphProbe.outputFiles[0].contents); return;
  }
  if (path === '/check-stance.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.end(stanceProbe.outputFiles[0].contents); return;
  }
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
  await checkSpeech(browser, address, speechProbe);
  await page.goto(address);
  await page.waitForFunction(() => window.companion?.ready === true, undefined, { timeout: 30000 });
  await page.evaluate(() => { document.body.style.background = '#0e0e13'; });
  await mkdir('/tmp/companion-review', { recursive: true });
  await page.setViewportSize({ width: 390, height: 420 });
  await page.evaluate(() => window.companion.setViewport(390, 420));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/companion-review/greeting.png' });
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'idle', undefined, { timeout: 8000 });
  // A background tap and a vertical drag must not fire a character reaction.
  await page.mouse.click(12, 12);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'idle');
  await page.mouse.move(195, 180); await page.mouse.down();
  await page.mouse.move(195, 220, { steps: 5 }); await page.mouse.up();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'idle');
  await page.mouse.click(195, 180);
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'touch');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/companion-review/touch.png' });
  await page.evaluate(() => window.companion.setState('listening', false));
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'listening');
  // Review actual poses, not just a phase variable changed four times in one frame.
  for (const phase of ['idle', 'listening', 'thinking', 'speaking']) {
    await page.evaluate(phase => window.companion.setState(phase, false), phase);
    await page.waitForFunction(phase => document.documentElement.dataset.motion === phase, phase);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `/tmp/companion-review/acting-${phase}.png` });
  }
  await page.mouse.move(195, 180); await page.mouse.down();
  await page.mouse.move(305, 180, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(450);
  await page.screenshot({ path: '/tmp/companion-review/stance-three-quarter.png' });
  await page.mouse.move(305, 180); await page.mouse.down();
  await page.mouse.move(195, 180, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(450);
  // Native sheets/background pause the canvas; resume must animate the existing scene.
  await page.evaluate(() => window.companion.setActive(false));
  const paused = await page.screenshot();
  await page.waitForTimeout(250);
  assert.deepEqual(await page.screenshot(), paused);
  await page.evaluate(() => { window.companion.setFrameRate(30); window.companion.setActive(true); });
  await page.waitForTimeout(350);
  assert.notDeepEqual(await page.screenshot(), paused);
  await page.evaluate(() => window.companion.setState('thinking', true));
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduced');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/companion-review/reduced-motion.png' });
  for (const [width, height] of [[390, 420], [700, 800], [300, 400]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(({ width, height }) => window.companion.setViewport(width, height), { width, height });
    for (const phase of ['idle', 'listening', 'thinking', 'speaking']) {
      await page.evaluate(phase => window.companion.setState(phase, false), phase);
      assert.equal(await page.evaluate(() => window.companion.phase), phase);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `/tmp/companion-review/${phase}-${width}.png` });
    }
    await page.evaluate(() => window.companion.setState('idle', true));
    // Let spring bones settle before visual inspection.
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `/tmp/companion-review/avatar-${width}.png` });
    assert.equal(await page.locator('canvas').count(), 1);
  }
  // Exercise actual WebGL loss, including time for the animation loop to run.
  await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    window.recoveryProbe = gl.getExtension('WEBGL_lose_context');
    if (!window.recoveryProbe) throw new Error('Context-loss extension unavailable');
    window.recoveryProbe.loseContext();
  });
  await page.waitForFunction(() => document.documentElement.dataset.status === 'error');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.companion.ready), false);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.status), 'error');
  const navigation = page.waitForEvent('load');
  await page.evaluate(() => window.recoveryProbe.restoreContext());
  await navigation;
  await page.waitForFunction(() => window.companion?.ready === true, undefined, { timeout: 30000 });
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await page.evaluate(() => window.companion.phase), 'idle');
  await page.screenshot({ path: '/tmp/companion-review/context-restored.png' });
  // Verify all expression presets and mixed face poses on the real bundled VRM.
  const morphs = await page.evaluate(async () => (await import('/check-morphs.js')).checkMorphs());
  assert.ok(morphs.after.targets < morphs.before.targets, JSON.stringify(morphs));
  assert.ok(morphs.after.attributeBytes < morphs.before.attributeBytes, JSON.stringify(morphs));
  assert.ok(morphs.maxDelta < 0.00001, JSON.stringify(morphs));
  console.log('Morph regression:', JSON.stringify(morphs));
  const stance = await page.evaluate(async () => (await import('/check-stance.js')).checkStance());
  assert.ok(stance.samples > 1000, JSON.stringify(stance));
  assert.ok(stance.maxHipDisplacement > 0.01, JSON.stringify(stance));
  assert.ok(stance.maxNormalizedFootDrift < 0.00001, JSON.stringify(stance));
  assert.ok(stance.maxRawFootDrift < 0.00001, JSON.stringify(stance));
  assert.ok(stance.maxRawFootAngle < 0.00001, JSON.stringify(stance));
  assert.ok(stance.maxLengthChange < 0.00001, JSON.stringify(stance));
  assert.ok(stance.minKneeForward > -0.00001, JSON.stringify(stance));
  console.log('Stance regression:', JSON.stringify(stance));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  // A broken model must produce an explicit error, never a fake ready state.
  const broken = await browser.newPage();
  await broken.route('**/character.vrm', route => route.abort());
  await broken.goto(address);
  await broken.waitForFunction(() => document.documentElement.dataset.status === 'error');
  assert.equal(await broken.evaluate(() => window.companion.ready), false);
  console.log('PASS: VRM loads; authored state poses, actual hit-tested touch, drag/background rejection, reduced motion; three sizes; WebGL loss/reload recovery; equivalent optimized facial morphs; planted raw and normalized feet across all stance clips; no external fetches; explicit missing-model error. Chromium only, not WKWebView/device QA.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
