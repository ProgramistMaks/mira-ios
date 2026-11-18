// Real audio input and packaged Whisper. Surround an addressed command with ordinary conversation.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { microphoneSequence } from './microphone-fixture.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const profile = await mkdtemp(path.join(os.tmpdir(), 'mira-name-gate-'));
let app;
try {
  const clip = (file) => readFile(path.join(root, 'Desktop/tests/fixtures', file + '.wav'));
  const [ambient, wake, browser] = await Promise.all(
    ['note-ru', 'wake-word-ru', 'wake-browser-ru'].map(clip),
  );
  const file = path.join(profile, 'sequence.wav');
  await writeFile(file, microphoneSequence([2, ambient, 5, wake, 4, ambient, 6, ambient, 5, browser, 7]));
  const args = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + file + '%noloop',
  ];
  if (process.platform !== 'win32')
    args.push(
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      process.env.MIRA_APP_DIR || path.join(root, 'Desktop'),
    );
  app = await _electron.launch({
    executablePath: process.env.MIRA_ELECTRON || path.join(root, 'build/desktop/Mira/Mira.exe'),
    args,
    env: { ...process.env, MIRA_TEST_PROFILE: profile },
  });
  const p = await app.firstWindow();
  await expect(p.locator('#intro #startListening')).toHaveValue('on');
  await p.evaluate(() => window.desk.call('settings', { ttsEnabled: false }));
  await app.evaluate(({ shell }) => {
    globalThis.wakeURLs = [];
    shell.openExternal = async (url) => {
      globalThis.wakeURLs.push(url);
    };
  });
  await p.locator('#introSkip').click();
  await expect(p.locator('#serviceMic')).toHaveAttribute('aria-pressed', 'true');
  await expect(p.locator('#voiceStatus')).toContainText('Жду обращения');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith('/index.html'))
      .hide(),
  );
  const count = () =>
    p.evaluate(
      async () => (await window.desk.call('state')).notes.filter((n) => /купить молоко/i.test(n.text)).length,
    );
  await expect.poll(count, { timeout: 50000 }).toBe(1);
  await expect
    .poll(() => app.evaluate(() => globalThis.wakeURLs), { timeout: 55000 })
    .toEqual(['https://www.google.com/']);
  assert.equal(await count(), 1);
  const turns = await p.evaluate(async () =>
    (await window.desk.call('state')).chats
      .flatMap((c) => c.messages)
      .filter((m) => m.role === 'user')
      .map((m) => m.text),
  );
  assert.equal(turns.length, 2, JSON.stringify(turns));
  assert.ok(!turns.some((t) => /мир[аы]/i.test(t)), JSON.stringify(turns));
  await expect(p.locator('#voiceStatus')).toContainText('Жду обращения');
  console.log(
    'Hidden window, real microphone fixture and local Whisper: two unaddressed utterances ignored; one question after a bare name and one directly addressed browser command accepted.',
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
