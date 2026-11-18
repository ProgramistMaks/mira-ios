import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  profile = await mkdtemp(path.join(os.tmpdir(), 'mira-navigation-'));
let app, p;
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
  p = await app.firstWindow();
  p.on('pageerror', (e) => errors.push(e.message));
}
try {
  await launch();
  await p.locator('#introSkip').click();
  await p.evaluate(() => document.fonts.ready);
  for (const [width, expected] of [
    [820, 624],
    [1050, 798],
    [1280, 798],
  ]) {
    await p.setViewportSize({ width, height: 700 });
    const sizes = await p.evaluate(() =>
      ['#tabs', '#tabs button', '#welcome h1', '#messageForm', '#hello'].map((k) => {
        const el = document.querySelector(k),
          r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        return { x: r.x, y: r.y, w: r.width, h: r.height, font: s.fontFamily, weight: s.fontWeight };
      }),
    );
    const [tabs, button, heading, form, sub] = sizes;
    assert.ok(
      Math.abs(tabs.w - expected) < 1.2 && Math.abs(tabs.x + tabs.w / 2 - width / 2) < 1,
      JSON.stringify(sizes),
    );
    assert.ok(Math.abs(button.w - 115.2) < 1 && Math.abs(button.h - 29.2) < 1);
    assert.ok(button.font.includes('JetBrains Mono') && button.weight === '600');
    assert.ok(
      heading.font.includes('JetBrains Mono') && heading.weight === '800' && sub.font.includes('Neucha'),
    );
    assert.ok(Math.abs(form.y - 398) < 2 && Math.abs(form.w - Math.min(800, width - 96)) < 1.1);
    assert.ok(Math.abs(sub.y - 318) < 2, JSON.stringify(sub));
  }
  await p.locator('#composerVoice').click();
  await expect(p.locator('#serviceVoice')).toHaveAttribute('aria-pressed', 'false');
  await p.locator('#serviceVoice').click();
  await expect(p.locator('#composerVoice')).toHaveAttribute('aria-pressed', 'true');
  const menu = () => p.locator('#navMenuButton').click(),
    sheet = () => p.locator('#navMenu');
  await menu();
  await expect(sheet().locator('[data-pin=home]')).toBeDisabled();
  await sheet().locator('[data-pin=voice]').click();
  await expect(p.locator('#tabs [data-go=voice]')).toHaveCount(0);
  await sheet().locator('#availableNav [data-go=voice]').click();
  await expect(p.locator('#area')).toHaveAttribute('data-page', 'voice');
  await expect(sheet()).toBeHidden();
  await menu();
  await sheet().locator('[data-pin=voice]').click();
  await expect(p.locator('#tabs button').last()).toHaveAttribute('data-go', 'voice');
  const grip = sheet().locator('[data-id=voice] .navGrip');
  await grip.press('Alt+ArrowUp');
  await expect(p.locator('#tabs button').last()).toHaveAttribute('data-go', 'settings');
  await grip.dragTo(sheet().locator('[data-id=commands] .navDest'));
  await expect(p.locator('#tabs button').nth(1)).toHaveAttribute('data-go', 'voice');
  await p.keyboard.press('Escape');
  await expect(sheet()).toBeHidden();
  await expect(p.locator('#navMenuButton')).toBeFocused();
  await p.locator('#tabs [data-go=settings]').click();
  for (const id of ['paper', 'ocean', 'lavender', 'custom']) {
    await p.locator('.swatch[data-id=' + id + ']').click();
    await expect(p.locator('body')).toHaveAttribute('data-theme', id);
  }
  await p.locator('#customColor').fill('#102539');
  await expect(p.locator('body')).toHaveAttribute('data-palette-tone', 'dark');
  await expect
    .poll(() => p.evaluate(() => getComputedStyle(document.body).getPropertyValue('--paper').trim()))
    .toBe('#102539');
  await p.locator('#customColor').fill('#eae0f6');
  await expect(p.locator('body')).toHaveAttribute('data-palette-tone', 'light');
  await app.close();
  await launch();
  await expect(p.locator('body')).toHaveAttribute('data-theme', 'custom');
  await expect(p.locator('#tabs button').nth(1)).toHaveAttribute('data-go', 'voice');
  assert.equal(
    await p.evaluate(() => getComputedStyle(document.body).getPropertyValue('--paper').trim()),
    '#eae0f6',
  );
  await p.setViewportSize({ width: 820, height: 600 });
  await menu();
  await sheet().locator('[data-pin=desk]').click();
  await expect(p.locator('#tabs button').last()).toHaveAttribute('data-go', 'desk');
  await sheet().locator('[data-go=desk]').click();
  await expect(p.locator('#tabs [aria-current=page]')).toHaveAttribute('data-go', 'desk');
  await expect.poll(() => p.locator('#tabs').evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  assert.deepEqual(errors, []);
  console.log(
    'Navigation geometry at 820/1050/1280, typefaces, drawer, drag and keyboard order, saved themes, sound toggle and restart passed.',
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 4 });
}
