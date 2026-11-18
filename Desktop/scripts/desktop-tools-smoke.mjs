// Exercise feature entry points in a clean temporary profile with a local model fixture.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  profile = await mkdtemp(path.join(os.tmpdir(), 'mira-tools-ui-'));
const requests = [];
const server = createServer(async (req, res) => {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'fixture' }, { id: 'extra-fixture' }] }));
    return;
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  requests.push(JSON.parse(body));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: 'Fixture result' } }] }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let app;
const errors = [];
async function launch() {
  app = await _electron.launch({
    executablePath: process.env.MIRA_ELECTRON || path.join(root, 'build/desktop/Mira/Mira.exe'),
    args:
      process.platform === 'win32'
        ? []
        : [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            process.env.MIRA_APP_DIR || path.join(root, 'Desktop'),
          ],
    env: { ...process.env, MIRA_TEST_PROFILE: profile },
  });
  await app.firstWindow();
  await expect
    .poll(() => app.windows().some((w) => w.url() === 'mira://desk/index.html'), { timeout: 12000 })
    .toBe(true);
  const p = app.windows().find((w) => w.url() === 'mira://desk/index.html');
  p.setDefaultTimeout(12000);
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
try {
  let p = await launch();
  await expect(p.locator('#introTitle')).toHaveText('Привет, я Мира');
  await p.locator('#language').selectOption('en');
  await expect(p.locator('html')).toHaveAttribute('lang', 'en', { timeout: 15000 });
  await expect(p.locator('#introTitle')).toHaveText('Hi, I’m Mira');
  await p.locator('#introNext').click();
  await p.locator('[data-setup-mode=quick]').click();
  for (let i = 0; i < 8 && (await p.locator('#intro[open]').count()); i++)
    await p.locator('#introNext').click();
  await expect(p.locator('#guidedTour')).toBeVisible();
  for (let i = 0; i < 11; i++) await p.locator('[data-tour=next]').click();
  await expect(p.locator('#guidedTour')).toHaveCount(0);
  await p.locator('#tabs [data-go=ai]').click();
  await p.locator('#provider').selectOption('endpoint');
  await p.locator('#preset').selectOption('https://api.mistral.ai/v1');
  await expect(p.locator('#cloudModel')).toHaveValue('mistral-small-latest');
  await p.locator('#base').fill('http://127.0.0.1:' + server.address().port + '/v1');
  await p.locator('#cloudModel').fill('fixture');
  await p.locator('[data-act=saveAI]').click();
  await expect(p.locator('#availableAI option').nth(2)).toHaveAttribute('value', 'fixture');
  await p.locator('[data-act=assistants]').click();
  await p.locator('#assistantRole').selectOption('writer');
  await p.locator('#jobPrompt').fill('Проверка заметки');
  await p.locator('[data-extra=startJob]').click();
  await expect(p.locator('#jobList')).toContainText('Fixture result', { timeout: 15000 });
  await expect(p.locator('#jobList')).toContainText('Проверка заметки');
  assert.ok(requests.some((x) => x.messages.at(-1).content === 'Проверка заметки'));
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'test';
    safeStorage.encryptString = (s) => Buffer.from(s);
    safeStorage.decryptString = (b) => b.toString();
    const real = globalThis.fetch;
    globalThis.fetch = (url, ...options) =>
      String(url) === 'https://api.openai.com/v1/images/generations'
        ? Promise.resolve(
            Response.json({
              data: [
                {
                  b64_json:
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
                },
              ],
            }),
          )
        : real(url, ...options);
  });
  await p.locator('#modal details summary').click();
  await p.locator('#imageKey').fill('local-test-fixture');
  await p.locator('[data-extra=imageKey]').click();
  await p.locator('#assistantRole').selectOption('image');
  await p.locator('#jobPrompt').fill('Test image');
  await p.locator('[data-extra=startJob]').click();
  await expect
    .poll(() => p.locator('.generatedImage').evaluateAll((images) => images[0]?.naturalWidth))
    .toBe(1);
  await p.keyboard.press('Escape');
  await p.locator('#aiKey').fill('saved-model-key-fixture');
  await p.locator('[data-act=saveAI]').click();
  await expect(p.locator('[data-act=useSavedAI]')).toHaveCount(1);
  await expect(p.locator('#aiKey')).toBeEmpty();
  await expect(p.locator('#availableAI option').nth(1)).toHaveAttribute('value', 'extra-fixture');
  await p.locator('#availableAI').selectOption('extra-fixture');
  await expect.poll(() => p.evaluate(async () => (await window.desk.call('state')).settings.cloudModel))
    .toBe('extra-fixture');
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      globalThis.openedByMira = url;
    };
  });
  await p.locator('#tabs [data-go=home]').click();
  await p.locator('#prompt').fill('открой браузер гугол');
  await p.locator('#send').click();
  await expect.poll(() => app.evaluate(() => globalThis.openedByMira)).toBe('https://www.google.com/');
  await p.evaluate(() => window.desk.call('settings', { name: 'Nova' }));
  await expect(p.locator('#nameplate span')).toHaveText('Nova');
  await p.locator('#historyBtn').click();
  await p.locator('#drawer [data-act=buildVoiceRoutine]').click();
  await expect(p.locator('#area')).toHaveAttribute('data-page', 'commands');
  await p.locator('[data-act=youtubeRoutine]').click();
  await expect(p.locator('#rPhrase')).toHaveValue('открой ютуб');
  await p.locator('[data-act=saveRoutine]').click();
  await expect.poll(() => p.evaluate(async () => (await window.desk.call('state')).routines
    .some(r => r.phrase === 'открой ютуб'))).toBe(true);
  await app.evaluate(({ shell }) => {
    globalThis.routineUrls = [];
    shell.openExternal = async (url) => { globalThis.routineUrls.push(url); };
  });
  await p.evaluate(async () => {
    const { WakeGate } = await import('/wake.mjs');
    const gate = new WakeGate();
    const text = gate.accept('Мира, открой ютуб', 'Мира');
    const { id } = await window.desk.call('newChat');
    await window.desk.call('send', { id, text, voiceMode: true });
  });
  assert.deepEqual(await app.evaluate(() => globalThis.routineUrls), [
    'https://www.google.com/',
    'https://www.youtube.com/',
  ]);
  await app.evaluate(() => {
    const real = globalThis.fetch;
    globalThis.fetch = (url, ...options) => String(url).startsWith('https://api.github.com/repos/ProgramistMaks/mira-ios/releases?')
      ? Promise.resolve(Response.json([{
          tag_name: 'desktop-v0.13.0',
          body: 'https://github.com/ProgramistMaks/mira-ios/raw/' + 'e'.repeat(40) +
            '/Mira-PC-0.13.0-Windows-x64.zip\nSHA-256 `' + 'a'.repeat(64) + '`',
        }]))
      : real(url, ...options);
  });
  await p.locator('#tabs [data-go=settings]').click();
  await p.locator('[data-act=checkUpdate]').click();
  await expect(p.locator('#content [role=status]').filter({hasText:'0.13.0'})).toBeVisible();
  await p.locator('[data-act=widgetShapes]').click();
  await p.locator('#shapeMode').selectOption('window');
  await p.locator('#shapePoints').fill('0,0 100,0 100,80 50,100 0,80');
  await p.locator('[data-extra=saveShape]').click();
  await expect
    .poll(() => p.evaluate(async () => (await window.desk.call('state')).screenWidgets?.focus?.shape))
    .toContain('50,100');
  await p.keyboard.press('Escape');
  await p.locator('[data-act=cachePreview]').click();
  await expect(p.locator('#modalTitle')).toHaveText('Cache preview');
  await p.keyboard.press('Escape');
  await app.close();
  p = await launch();
  await expect(p.locator('html')).toHaveAttribute('lang', 'en');
  await expect(p.locator('#intro')).toBeHidden();
  await expect(p.locator('#heroName')).toHaveText('Nova');
  await p.locator('#tabs [data-go=ai]').click();
  await expect(p.locator('[data-act=useSavedAI]')).toHaveCount(1);
  await expect(p.locator('#cloudModel')).toHaveValue('extra-fixture');
  assert.equal(
    await p.evaluate(
      async () => (await window.desk.call('assistantList')).find((x) => x.role === 'writer').result,
    ),
    'Fixture result',
  );
  await p.locator('#tabs [data-go=settings]').click();
  await p.locator('#uiLanguage').selectOption('ru');
  await expect(p.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(p.locator('#tabs [data-go=settings]')).toContainText('Настройки');
  assert.deepEqual(errors, []);
  console.log(
    'RU/EN first launch, eleven tour stops, provider presets, durable assistant job, desktop command, shape, cache preview and restart passed.',
  );
} finally {
  await app?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
