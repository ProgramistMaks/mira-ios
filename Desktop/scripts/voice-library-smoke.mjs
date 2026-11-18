// Opt-in live catalogue check. Uses only public listings and published samples.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { microphoneSequence } from './microphone-fixture.mjs';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(path.join(os.tmpdir(), 'mira-voices-'));
const exe = process.env.MIRA_ELECTRON || path.join(root, 'build/desktop/Mira/Mira.exe');
let app;
try {
  const clip = await readFile(path.join(root, 'Desktop/tests/fixtures/note-ru.wav'));
  const mic = path.join(dir, 'mic.wav');
  await writeFile(
    mic,
    microphoneSequence([
      2,
      await readFile(path.join(root, 'Desktop/tests/fixtures/wake-word-ru.wav')),
      5,
      clip,
      8,
    ]),
  );
  const args = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + mic + '%noloop',
  ];
  if (process.platform !== 'win32')
    args.push(
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage',
      process.env.MIRA_APP_DIR || path.join(root, 'Desktop'),
    );
  app = await _electron.launch({
    executablePath: exe,
    args,
    env: { ...process.env, MIRA_TEST_PROFILE: dir },
  });
  const p = await app.firstWindow();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.locator('#intro #startListening').selectOption('off');
  await p.locator('#introSkip').click();
  await p.locator('[data-go=voice]').first().click();
  await p.evaluate(() => {
    window.samplePlayed = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.samplePlayed.push(this.buffer?.duration || 0);
      return start.apply(this, args);
    };
  });
  for (const q of ['Братишкин', 'Джарвис']) {
    const f = p.locator('#fishQuery');
    await f.fill(q);
    await f.press('Enter');
    const first = p.locator('.fishRows li').first();
    await expect(first.locator('strong')).toHaveText(new RegExp(q, 'i'), { timeout: 40000 });
    await first.getByRole('button', { name: 'Послушать' }).click();
    await expect
      .poll(() => p.evaluate(() => window.samplePlayed.length), { timeout: 30000 })
      .toBe(q === 'Братишкин' ? 1 : 2);
    await first.getByRole('button', { name: 'Остановить' }).click();
  }
  const first = p.locator('.fishRows li').first();
  const chosen = await first.locator('strong').innerText();
  await first.getByRole('button', { name: 'В избранное', exact: true }).click();
  await p.locator('[data-act=fishSaved]').click();
  await expect(p.locator('.fishRows li')).toHaveCount(1);
  await first.getByRole('button', { name: 'Выбрать', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Ожидает ключ' })).toBeVisible();
  const settings = await p.evaluate(async () => (await window.desk.call('state')).settings);
  assert.equal(settings.voice, 'builtin');
  assert.equal(settings.fishVoiceName, chosen);
  assert.equal(settings.fishPending, true);
  assert.ok((await p.evaluate(() => window.samplePlayed)).every((n) => n > 0));
  await p.reload();
  await p.locator('[data-go=voice]').first().click();
  await p.locator('[data-act=fishSaved]').click();
  await expect(p.locator('.fishRows li strong')).toHaveText(chosen);
  // Exercise the normal Fish key, microphone, reply and playback routes. Only
  // the paid endpoint and the ephemeral profile's OS keyring are test doubles.
  await app.evaluate(({ safeStorage }, wav) => {
    const data = Buffer.from(wav, 'base64');
    const fetchOriginal = global.fetch;
    global.fishRequests = [];
    global.fetch = async (url, options) => {
      if (String(url) !== 'https://api.fish.audio/v1/tts') return fetchOriginal(url, options);
      if (options.headers.Authorization !== 'Bearer fixture-token') throw Error('Unexpected test key');
      global.fishRequests.push(JSON.parse(options.body));
      return new Response(data);
    };
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'test';
    safeStorage.encryptString = (v) => Buffer.from(v);
    safeStorage.decryptString = (v) => Buffer.from(v).toString();
  }, clip.toString('base64'));
  await p.locator('#fishKey').fill('fixture-token');
  await p.locator('[data-act=keyFish]').click();
  await expect
    .poll(() => p.evaluate(async () => (await window.desk.call('state')).settings.voice))
    .toBe('fish');
  await p.locator('[data-go=home]').first().click();
  await p.evaluate(() => {
    window.phases = [];
    const el = document.querySelector('#voiceStatus');
    new MutationObserver(() => window.phases.push(el.textContent)).observe(el, {
      subtree: true,
      childList: true,
    });
  });
  await p.locator('#voiceStart').click();
  await p.waitForFunction(
    () => window.phases.includes('Отвечаю…') && window.phases.at(-1) === 'Жду обращения «Мира»',
    null,
    { timeout: 90000 },
  );
  assert.deepEqual(await app.evaluate(() => global.fishRequests.map((x) => [x.reference_id, x.text])), [
    [settings.fishVoice, 'Записала в заметки.'],
  ]);
  await p.locator('#voiceEnd').click();
  await p.locator('[data-go=home]').first().click();
  await p.locator('#prompt').fill('Посмотри в интернете knice.tech Astra');
  await p.locator('#send').click();
  await expect
    .poll(
      () =>
        p.evaluate(
          async () => (await window.desk.call('state')).chats[0]?.messages.at(-1)?.sources?.length || 0,
        ),
      { timeout: 75000 },
    )
    .toBeGreaterThan(0);
  assert.deepEqual(errors, []);
  console.log(
    'Both Russian queries found public voices and played decoded audio in Electron. Favorite and pending choice survived restart. A microphone turn sent its real reply and the chosen reference ID to the simulated paid endpoint. Conversation web search returned live sources.',
  );
} finally {
  await app?.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 4 });
}
