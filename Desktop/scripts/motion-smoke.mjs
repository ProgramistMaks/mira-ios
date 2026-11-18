import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const profile = await mkdtemp(path.join(os.tmpdir(), 'mira-motion-'));
let app;
try {
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
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.locator('#introSkip').click();
  await expect(p.locator('#intro')).toBeHidden();
  // Seek the actual renderer transition, independent of GPU and CI scheduling.
  const frames = await p.evaluate(async () => {
    const button = document.querySelector('#navMenuButton'),
      el = document.querySelector('#navMenu');
    button.click();
    await new Promise(requestAnimationFrame);
    const a = el.getAnimations().find((a) => a.transitionProperty === 'translate');
    if (!a) throw Error('Missing drawer transition');
    a.pause();
    const duration = a.effect.getTiming().duration;
    const positions = [0, 50, 100, 200, 300, 400].map((t) => {
      a.currentTime = t;
      return el.getBoundingClientRect().left;
    });
    a.finish();
    const last = positions.at(-1);
    return { duration, positions: positions.map((x) => Math.round(x - last)), width: el.offsetWidth };
  });
  assert.equal(frames.duration, 400);
  assert.equal(frames.width, 320);
  for (const [i, offset] of [332, 213, 73, 15, 3, 0].entries())
    assert.ok(Math.abs(frames.positions[i] - offset) <= 1, JSON.stringify(frames));
  // Reverse while leaving; Escape and native top-layer focus must still work.
  await p.evaluate(() => {
    const el = document.querySelector('#navMenu');
    el.hidePopover();
    void el.offsetWidth;
    el.showPopover();
  });
  await p.keyboard.press('Escape');
  await expect(p.locator('#navMenu')).toBeHidden();
  await p.evaluate(() => {
    window.sampledSurfaces = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      const transition = start(...args);
      transition.ready.then(
        () => {
          const root = document.documentElement;
          const phase = getComputedStyle(root, '::view-transition-new(mira-surface)');
          window.sampledSurfaces.push([
            root.dataset.surfaceMotion,
            phase.animationName,
            phase.animationDuration,
          ]);
        },
        () => {},
      );
      return transition;
    };
  });
  await p.locator('#tabs [data-go=settings]').click();
  await expect(p.locator('#area')).toHaveAttribute('data-page', 'settings');
  const menu = p.locator('#navMenu');
  await p.locator('#navMenuButton').click();
  await menu.locator('[data-go=desk]').click();
  await expect(p.locator('#area')).toHaveAttribute('data-page', 'desk');
  await p.locator('#tabs [data-go=home]').click();
  await expect(p.locator('#area')).toHaveAttribute('data-page', 'home');
  await p.waitForFunction(() => !document.documentElement.hasAttribute('data-surface-motion'));
  const samples = await p.evaluate(() => window.sampledSurfaces);
  assert.ok(
    samples.some(([kind, name, time]) => kind === 'page' && name === 'mira-fade' && time === '0.12s'),
    JSON.stringify(samples),
  );
  assert.ok(
    samples.some(([kind, name, time]) => kind === 'chat' && name === 'mira-wipe' && time === '0.36s'),
    JSON.stringify(samples),
  );
  const listEffects = await p.evaluate(async () => {
    const { rowChanges, rollingNumber } = await import('./motion.js');
    const host = document.createElement('section');
    document.body.append(host);
    const run = () => rowChanges(host, '.orgTask', 'one');
    run()();
    const enter = run();
    host.innerHTML = '<div class="orgTask" data-id="1">Тест</div>';
    enter();
    const first = host.firstElementChild;
    const timings = first.getAnimations().map((a) => a.effect.getTiming().duration);
    first.getAnimations().forEach((a) => a.finish());
    const refresh = run();
    first.replaceWith(first.cloneNode(true));
    refresh();
    const repeats = host.firstElementChild.getAnimations().length;
    const leave = run();
    host.replaceChildren();
    leave();
    const ghost = document.querySelector('.motionDeparture');
    const leaving = !!ghost?.inert;
    ghost?.getAnimations().forEach((a) => a.finish());
    host.textContent = '00:10';
    rollingNumber(host, '00:11');
    const digits = host.querySelectorAll('.rollingDigit').length;
    host.remove();
    return { timings, repeats, leaving, digits };
  });
  assert.deepEqual(listEffects, { timings: [350], repeats: 0, leaving: true, digits: 1 });
  const text = await p.evaluate(async () => {
    const { streamText } = await import('./motion.js');
    const el = document.createElement('div');
    document.body.append(el);
    streamText(el, '', 'Привет');
    streamText(el, 'Привет', 'Привет, Мира!');
    const effects = el.getAnimations({ subtree: true });
    const durations = effects.map((a) => a.effect.getTiming().duration);
    for (const a of effects) a.finish();
    await Promise.all(effects.map((a) => a.finished));
    const result = { durations, text: el.textContent, nodes: el.children.length };
    streamText(el, el.textContent, 'Исправлено');
    result.revised = el.textContent;
    el.remove();
    return result;
  });
  assert.deepEqual(text, { durations: [600, 600], text: 'Привет, Мира!', nodes: 0, revised: 'Исправлено' });
  await p.evaluate(() => window.desk.call('settings', { reduced: true }));
  await p.waitForFunction(() => document.documentElement.hasAttribute('data-still'));
  for (const system of [false, true]) {
    if (system) {
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.evaluate(() => window.desk.call('settings', { reduced: false }));
      await p.waitForFunction(() => !document.documentElement.hasAttribute('data-still'));
    }
    const motion = await p.evaluate(() => {
      const el = document.querySelector('#navMenu');
      el.showPopover();
      void el.offsetWidth;
      const count = el.getAnimations().length;
      el.hidePopover();
      return count;
    });
    assert.equal(motion, 0);
  }
  assert.deepEqual(errors, []);
  console.log('Drawer travel in px at 0/50/100/200/300/400 ms:', frames.positions.join(', '));
  console.log('Navigation, reversal, stream append/replace and both reduced-motion paths passed.');
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
