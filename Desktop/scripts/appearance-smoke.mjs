// Exercise profile-backed backgrounds and the session error log in the desktop UI.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const profile = await mkdtemp(path.join(os.tmpdir(), 'mira-appearance-'));
let app;
const faults = [];
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
  const p = await app.firstWindow();
  p.on('pageerror', (e) => faults.push(e.message));
  return p;
}
try {
  let p = await launch();
  await p.locator('#introSkip').click();
  const prefs = async () => p.locator('#tabs [data-go=settings]').click();
  const home = async () => p.locator('#tabs [data-go=home]').click();
  const upload = async (name, mimeType, buffer) => {
    await expect(p.locator('#wallFile')).toBeEnabled();
    await p.locator('#wallFile').setInputFiles({ name, mimeType, buffer });
  };
  await expect(p.locator('#journalButton')).toBeHidden();
  await prefs();
  await p.locator('#wallMode').selectOption('solid');
  await home();
  await expect(p.locator('#homeBackdrop')).toHaveAttribute('data-mode', 'solid');
  await prefs();
  await p.locator('#wallMode').selectOption('cozy');
  for (const pattern of ['dots', 'grain', 'stars', 'none', 'sketch']) {
    await p.locator('#wallPattern').selectOption(pattern);
    await expect(p.locator('#homeBackdrop')).toHaveAttribute('data-pattern', pattern);
  }
  await p.locator('#wallTexture').fill('0.75');
  await p.locator('#wallMode').selectOption('custom');
  const picture = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 18;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#a13456';
    ctx.fillRect(0, 0, 24, 18);
    return c.toDataURL('image/png').split(',')[1];
  });
  await upload('Цвет.png', 'image/png', Buffer.from(picture, 'base64'));
  await expect(p.locator('.wallTile button[aria-pressed=true]')).toHaveText('Цвет.png');
  await home();
  await expect.poll(() => p.locator('#homeBackdrop img').evaluate((e) => e.naturalWidth)).toBe(24);
  if (process.env.MIRA_APPEARANCE_SCREENSHOT)
    await p.screenshot({ path: process.env.MIRA_APPEARANCE_SCREENSHOT });
  // Make a real playable clip using the same browser's supported WebM codec.
  const clip = await p.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 64;
    const ctx = c.getContext('2d'),
      stream = c.captureStream(10),
      rec = new MediaRecorder(stream, { mimeType: 'video/webm' }),
      parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    const done = new Promise((resolve) => (rec.onstop = resolve));
    rec.start();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? 'red' : 'navy';
      ctx.fillRect(0, 0, 80, 64);
      await new Promise((r) => setTimeout(r, 110));
    }
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()));
  });
  await prefs();
  const jpeg = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 20;
    return c.toDataURL('image/jpeg').split(',')[1];
  });
  await upload('Фото.jpg', 'image/jpeg', Buffer.from(jpeg, 'base64'));
  await expect(p.locator('.wallTile button[aria-pressed=true]')).toHaveText('Фото.jpg');
  await p.getByRole('button', { name: 'Удалить Фото.jpg' }).click();
  if (process.env.MIRA_TEST_MP4) {
    await upload('Видео.mp4', 'video/mp4', await readFile(process.env.MIRA_TEST_MP4));
    await expect(p.locator('.wallTile button[aria-pressed=true]')).toHaveText('Видео.mp4');
    await home();
    await expect
      .poll(() => p.locator('#homeBackdrop video').evaluate((v) => v.currentTime > 0 && !v.paused))
      .toBe(true);
    await prefs();
    await p.getByRole('button', { name: 'Удалить Видео.mp4' }).click();
  }
  await upload('Небо.webm', 'video/webm', Buffer.from(clip));
  await expect(p.locator('.wallTile button[aria-pressed=true]')).toHaveText('Небо.webm');
  await home();
  await expect
    .poll(() =>
      p.locator('#homeBackdrop video').evaluate((v) => v.muted && v.loop && v.currentTime > 0 && !v.paused),
    )
    .toBe(true);
  await prefs();
  await expect.poll(() => p.locator('#homeBackdrop video').evaluate((v) => v.paused)).toBe(true);
  await app.close();
  p = await launch();
  await expect.poll(() => p.locator('#homeBackdrop video').evaluate((v) => v.videoWidth)).toBe(80);
  await prefs();
  await expect(p.locator('.wallTile')).toHaveCount(2);
  await upload('Битый.png', 'image/png', Buffer.from('broken'));
  const badge = p.locator('#journalButton'),
    log = p.locator('#journalPanel');
  await expect(p.locator('#journalCount')).toHaveText('1');
  await badge.click();
  await expect(log).toBeVisible();
  const bounds = await log.boundingBox(),
    anchor = await badge.boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= anchor.y + 1);
  assert.ok(Math.abs(bounds.x + bounds.width - anchor.x - anchor.width) < 3);
  await expect(p.locator('#journalCount')).toBeHidden();
  await expect(p.locator('#journalTitle')).toHaveText('Ошибки (1/20)');
  const message = await p.locator('#journalList li span').first().innerText();
  await log.getByRole('button', { name: 'Копировать' }).click();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), message);
  await p.keyboard.press('Escape');
  await expect(log).toBeHidden();
  await expect(badge).toBeFocused();
  await expect(p.locator('.wallTile button[aria-pressed=true]')).toHaveText('Небо.webm');
  await p.getByRole('button', { name: 'Удалить Небо.webm' }).click();
  await expect(p.locator('.wallTile button[aria-pressed=true]')).toHaveText('Цвет.png');
  await home();
  await expect.poll(() => p.locator('#homeBackdrop img').evaluate((i) => i.naturalWidth)).toBe(24);
  for (let i = 0; i < 22; i++)
    await app.evaluate(
      ({ BrowserWindow }, n) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().endsWith('/index.html'))
          .webContents.send('update', { type: 'notice', error: true, message: 'Ошибка ' + n }),
      i,
    );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith('/index.html'))
      .webContents.send('update', { type: 'notice', message: 'Успешно' }),
  );
  await expect(p.locator('#journalCount')).toHaveText('9+');
  await badge.click();
  await expect(log.locator('li')).toHaveCount(20);
  await expect(log.locator('li span').first()).toHaveText('Ошибка 21');
  await expect(log.locator('li span').last()).toHaveText('Ошибка 2');
  await p.locator('#journalClear').click();
  await expect(badge).toBeHidden();
  await expect(log).toBeHidden();
  await prefs();
  await p.getByRole('button', { name: 'Удалить Цвет.png' }).click();
  await expect(p.locator('.wallTile')).toHaveCount(0);
  await p.locator('#wallMode').selectOption('cozy');
  await expect(p.locator('#wallTexture')).toHaveValue('0.75');
  await p.locator('#glass').selectOption('on');
  await expect
    .poll(() => p.locator('#tabs').evaluate((el) => getComputedStyle(el).backdropFilter))
    .toMatch(/blur/);
  await p.locator('#disableBlur').selectOption('on');
  await expect
    .poll(() => p.locator('#tabs').evaluate((el) => getComputedStyle(el).backdropFilter))
    .toBe('none');
  await p.locator('#windowButtonBackground').selectOption('on');
  const closeButton = p.locator('.window [data-win=close]');
  await expect.poll(() => closeButton.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%');
  await closeButton.click();
  const mainVisible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('/index.html'))
        .isVisible(),
    );
  await expect.poll(mainVisible).toBe(false);
  await p.evaluate(() => window.desk.call('show'));
  await expect.poll(mainVisible).toBe(true);
  await p.locator('#minimizeToTray').selectOption('off');
  await expect(closeButton).toHaveAttribute('aria-label', 'Выйти из Миры');
  const closed = app.waitForEvent('close');
  await closeButton.click();
  await closed;
  app = null;
  assert.deepEqual(faults, []);
  console.log(
    'Cozy patterns, solid fill, image, playing WebM, profile restart, adjacent selection, session log, badge, clipboard, bounds and clearing passed.',
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 4 });
}
