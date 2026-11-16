import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

export async function speechProbeBundle() {
  // Observe the production pipeline without shipping a debug API in the app.
  const marker = '  const clock = new THREE.Clock();';
  const source = await readFile('Renderer/avatar.ts', 'utf8');
  assert.equal(source.split(marker).length, 2, 'Speech probe insertion point changed');
  const result = await build({ stdin: {
    contents: source.replace(marker, `${marker}
      Object.defineProperty(window, 'speechProbe', { get: () => ({
        input: speechSamples.level(), mouth: avatar.expressionManager?.getValue('aa') ?? 0,
      }) });`),
    resolveDir: new URL('../Renderer/', import.meta.url).pathname, loader: 'ts',
  }, bundle: true, write: false, format: 'iife', target: ['chrome120'] });
  return result.outputFiles[0].contents;
}

export async function checkSpeech(browser, address, bundle) {
  const page = await browser.newPage({ viewport: { width: 390, height: 420 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.route('**/avatar.js', route => route.fulfill({
      contentType: 'application/javascript', body: Buffer.from(bundle),
    }));
    await page.goto(address);
    await page.waitForFunction(() => window.companion?.ready, undefined, { timeout: 30000 });
    await page.evaluate(() => {
      window.companion.setState('speaking', true);
      window.speechSequence = 0;
      window.feedSpeech = (level, age = 0) => {
        clearInterval(window.speechTimer);
        const send = () => window.companion.setSpeech(level, Date.now() - age, ++window.speechSequence);
        send(); window.speechTimer = setInterval(send, 20);
      };
      window.feedSpeech(0.9);
    });
    await page.waitForFunction(() => window.speechProbe.mouth > 0.6);
    // Reordered/duplicate packets must not overwrite the latest valid amplitude.
    assert.equal(await page.evaluate(() => {
      window.companion.setSpeech(0, Date.now(), window.speechSequence - 1);
      window.companion.setSpeech(0, Date.now(), window.speechSequence);
      return window.speechProbe.input;
    }), 0.9);
    await page.evaluate(() => clearInterval(window.speechTimer));
    await page.waitForFunction(() => window.speechProbe.mouth < 0.001);
    // Repeated delayed packets cannot keep the mouth open by refreshing its TTL.
    await page.evaluate(() => window.feedSpeech(1, 1000));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.speechProbe.input), 0);
    assert.ok(await page.evaluate(() => window.speechProbe.mouth < 0.001));
    await page.evaluate(() => window.feedSpeech(0.9));
    await page.waitForFunction(() => window.speechProbe.mouth > 0.6);
    await page.evaluate(() => window.companion.setState('idle', true));
    await page.waitForFunction(() => window.speechProbe.mouth === 0);
    await page.evaluate(() => {
      clearInterval(window.speechTimer);
      window.companion.setState('speaking', true);
      window.companion.setActive(false);
      window.companion.setSpeech(1, Date.now(), ++window.speechSequence);
      window.companion.setActive(true);
    });
    assert.equal(await page.evaluate(() => window.speechProbe.input), 0);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.speechProbe.mouth), 0);
    await page.evaluate(() => window.feedSpeech(0.9));
    await page.waitForFunction(() => window.speechProbe.mouth > 0.6);
    await page.evaluate(() => {
      clearInterval(window.speechTimer);
      window.companion.setSpeech(0, Date.now(), ++window.speechSequence);
    });
    await page.waitForFunction(() => window.speechProbe.mouth < 0.001);
    assert.deepEqual(errors, []);
    console.log('Speech regression: production bridge drives actual VRM mouth; expiry, delayed/reordered packets, phase reset, hidden/resumed scene, Reduced Motion and stop passed. Chromium only.');
  } finally { await page.close(); }
}
