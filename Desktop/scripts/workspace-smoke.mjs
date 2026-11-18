// Drive the real windows. Substitute file dialogs so the test owns every selected path.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
const root = fileURLToPath(new URL('../../', import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), 'mira-workspace-')),
  doc = path.join(tmp, 'sample.md');
await writeFile(doc, 'Начало проекта');
const win = process.platform === 'win32';
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
if (!win)
  args.push(
    '--no-sandbox',
    '--disable-dev-shm-usage',
    process.env.MIRA_APP_DIR || path.join(root, 'Desktop'),
  );
const launch = () =>
  _electron.launch({
    executablePath: process.env.MIRA_ELECTRON || path.join(root, 'build/desktop/Mira/Mira.exe'),
    args,
    env: { ...process.env, MIRA_TEST_PROFILE: path.join(tmp, 'profile') },
  });
let app;
try {
  app = await launch();
  const p = await app.firstWindow(),
    errors = [];
  p.setDefaultTimeout(12000);
  p.on('pageerror', (e) => errors.push(e.message));
  const click = (sel) => p.locator(sel).first().click(),
    go = (name) => click('[data-go="' + name + '"]'),
    action = (name) => click('[data-act="' + name + '"]:visible');
  const pick = async (f) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, f);
  const call = (name, data) => p.evaluate(([n, d]) => window.desk.call(n, d), [name, data]);
  await expect(p.locator('#introTitle')).toHaveText('Привет, я Мира');
  await p.locator('#introNext').click();
  await p.locator('[data-setup-mode=quick]').click();
  await p.locator('#introNext').click();
  await p.locator('#intro #silence').selectOption('1.25');
  await p.locator('#introBack').click();
  await p.locator('#introNext').click();
  await expect(p.locator('#intro #silence')).toHaveValue('1.25');
  for (let i = 0; i < 8 && (await p.locator('#intro').isVisible()); i++)
    await p.locator('#introNext').click();
  await expect(p.locator('#intro')).not.toBeVisible();
  assert.equal((await call('state')).settings.silence, 1.25);
  await p.locator('#heroName').waitFor();
  await go('settings');
  const theme = (await call('state')).settings.theme;
  await action('setup');
  await click('#introNext');
  await click('[data-setup-mode=quick]');
  for (let i = 0; i < 4; i++) await click('#introNext');
  await expect(p.locator('#introTitle')).toHaveText('Внешний вид');
  await p.locator('#intro #theme').selectOption(theme === 'night' ? 'cream' : 'night');
  assert.equal((await call('state')).settings.theme, theme);
  await click('#introSkip');
  await expect(p.locator('#intro')).not.toBeVisible();
  assert.equal((await call('state')).settings.theme, theme);
  await p.locator('#prefsQuery').fill('остров');
  await expect(p.locator('#island')).toBeVisible();
  await p.locator('#prefsQuery').fill('');
  const w = app.waitForEvent('window');
  await p.locator('#island').selectOption('on');
  const island = await w;
  island.setDefaultTimeout(12000);
  island.on('pageerror', (e) => errors.push(e.message));
  await island.locator('#expand').click();
  await expect(island.locator('main')).toBeVisible();
  await island.locator('[data-tab=shelf]').click();
  await pick(doc);
  await island.locator('[data-op=pick]').click();
  await expect(island.locator('[data-op=open]')).toHaveText('sample.md');
  await island.locator('[data-tab=clip]').click();
  await island.locator('[data-op=record]').click();
  await expect(island.locator('[data-op=record]')).toContainText('Выключить');
  await app.evaluate(({ clipboard }) => clipboard.writeText('Тест острова'));
  await expect(island.locator('[data-op=copy]')).toContainText('Тест острова');
  await island.locator('[data-op=record]').click();
  await expect(island.locator('[data-op=copy]')).toHaveCount(0);
  if (process.env.MIRA_EVIDENCE) {
    await mkdir(process.env.MIRA_EVIDENCE, { recursive: true });
    await island.locator('[data-tab=shelf]').click();
    await island.screenshot({ path: path.join(process.env.MIRA_EVIDENCE, 'island.png') });
  }
  await island.locator('[data-tab=chat]').click();
  await island.locator('#line').fill('Запиши заметку: Ответ с острова');
  await island.locator('form button').click();
  await expect
    .poll(async () => (await call('state')).notes.some((x) => x.text.includes('Ответ с острова')))
    .toBe(true);
  await go('settings');
  await p.locator('#island').selectOption('off');
  await go('home');
  await click('#historyBtn');
  await action('addProject');
  await p.locator('#projectName').fill('Мой проект');
  await p.locator('#projectRole').fill('Отвечай в метрах');
  await action('saveProject');
  await expect.poll(async () => (await call('state')).projects[0]?.instructions).toBe('Отвечай в метрах');
  await action('projectEditor');
  await pick(tmp);
  await action('projectFolder');
  await p.locator('#projectEntry').selectOption('sample.md');
  await action('projectRead');
  await expect(p.locator('#projectText')).toHaveValue('Начало проекта');
  await p.locator('#projectText').fill('Новая версия');
  await action('projectWrite');
  await expect.poll(() => readFile(doc, 'utf8')).toBe('Новая версия');
  await action('projectAttach');
  await expect(p.locator('#attachment')).toHaveText('sample.md');
  await go('desk');
  const widgetReady = app.waitForEvent('window');
  await p.locator('#place-focus').selectOption('pin');
  const widget = await widgetReady;
  widget.setDefaultTimeout(12000);
  await expect(widget.locator('header b')).toHaveText('Фокус');
  await widget.locator('#focus').click();
  await expect.poll(async () => (await call('state')).focus.ends).toBeGreaterThan(0);
  await widget.locator('#pin').click();
  await expect(widget.locator('#pin')).toHaveAttribute('aria-pressed', 'false');
  await widget.locator('#close').click();
  await expect.poll(async () => (await call('state')).screenWidgets.focus).toBeUndefined();
  await action('addShortcut');
  await p.locator('#launchName').fill('Мой ярлык');
  await action('saveShortcut');
  await expect.poll(async () => (await call('state')).shortcuts[0]?.name).toBe('Мой ярлык');
  await action('dropShortcut');
  await app.close();
  app = await launch();
  const reopened = await app.firstWindow();
  await reopened.locator('#heroName').waitFor();
  const saved = await reopened.evaluate(() => window.desk.call('state'));
  assert.equal(saved.settings.introDone, true);
  assert.equal(saved.settings.silence, 1.25);
  assert.equal(saved.settings.theme, theme);
  await expect(reopened.locator('#intro')).not.toBeVisible();
  assert.deepEqual(errors, []);
  console.log('Separate island, shelf, clipboard, chat, projects, editor and launch widgets passed.');
} finally {
  await app?.close();
  await rm(tmp, { recursive: true, force: true });
}
