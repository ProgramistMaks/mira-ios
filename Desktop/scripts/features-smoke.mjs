// Tests real file parsing, wardrobe rendering, app panels and persistence. Only the
// file picker is substituted, so CI can select the test documents without a desktop operator.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { PNG } from 'playwright-core/lib/utilsBundle';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  dir = await mkdtemp(path.join(os.tmpdir(), 'mira-features-'));
const windows = process.platform === 'win32',
  exe = process.env.MIRA_ELECTRON || path.join(root, 'build/desktop/Mira/Mira.exe'),
  evidence = process.env.MIRA_EVIDENCE;
if (evidence) await mkdir(evidence, { recursive: true });
function makePDF() {
  const stream = 'BT /F1 14 Tf 45 700 Td (MIRA PDF fixture) Tj ET';
  const parts = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
  ];
  let s = '%PDF-1.4\n',
    offsets = [0];
  parts.forEach((part, i) => {
    offsets.push(s.length);
    s += i + 1 + ' 0 obj\n' + part + '\nendobj\n';
  });
  const start = s.length;
  s +=
    'xref\n0 6\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((x) => String(x).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' +
    start +
    '\n%%EOF';
  return s;
}
let app;
try {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  if (!windows)
    args.push(
      '--no-sandbox',
      '--disable-dev-shm-usage',
      process.env.MIRA_APP_DIR || path.join(root, 'Desktop'),
    );
  app = await _electron.launch({
    executablePath: exe,
    args,
    env: { ...process.env, MIRA_TEST_PROFILE: path.join(dir, 'profile') },
  });
  const p = await app.firstWindow();
  const errors = [];
  p.on('pageerror', (e) => {
    errors.push(e.message);
    console.error('UI:', e.message);
  });
  p.on('console', (s) => {
    if (s.type() === 'error') console.error(s.text().slice(0, 260));
  });
  await p.locator('#introSkip').click();
  await expect(p.locator('#homeCharacter')).toHaveAttribute('aria-pressed', 'false');
  await p.locator('#navMenuButton').click();
  await p.locator('#homeCharacter').click();
  await p.waitForFunction(() => document.querySelector('#avatar')?.contentWindow.companion?.ready, null, {
    timeout: 90000,
  });
  const go = async (dest) =>
    p
      .locator('[data-go="' + dest + '"]')
      .first()
      .click();
  const state = () => p.evaluate(() => window.desk.call('state'));
  const close = () => p.evaluate(() => document.querySelector('#modal').close());
  for (const [ext, bytes, expected] of [
    ['pdf', makePDF(), 'MIRA PDF fixture'],
    [
      'docx',
      zipSync({
        'word/document.xml': strToU8(
          '<w:document xmlns:w="urn:test"><w:p><w:r><w:t>Документ Миры</w:t></w:r></w:p></w:document>',
        ),
      }),
      'Документ Миры',
    ],
  ]) {
    const file = path.join(dir, 'demo.' + ext);
    await writeFile(file, bytes);
    await app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
    }, file);
    await p.locator('#attach').click();
    await expect(p.locator('#attachment')).toContainText('demo.' + ext);
    await p.locator('#prompt').fill('Запиши заметку:');
    await p.locator('#send').click();
    await expect.poll(async () => (await state()).notes.some((n) => n.text.includes(expected))).toBe(true);
  }
  console.log('PDF and DOCX read through the file picker');
  await go('model');
  await expect(p.locator('.modelSections button')).toHaveCount(5);
  await p.locator('[data-act=modelSection][data-id=animations]').click();
  await p.locator('[data-act=playModelClip]').nth(1).click();
  await expect(p.locator('#scene')).toBeVisible();
  await p.locator('[data-act=modelSection][data-id=window]').click();
  await expect(p.locator('[data-act=seat]')).toBeVisible();
  await p.locator('[data-act=modelSection][data-id=appearance]').click();
  await p.locator('#outfit').selectOption('iris');
  await expect.poll(async () => (await state()).settings.outfit).toBe('iris');
  await p.waitForFunction(
    () =>
      document.querySelector('#avatar').contentWindow.location.search.includes('iris') &&
      document.querySelector('#avatar').contentWindow.companion?.ready,
    null,
    { timeout: 60000 },
  );
  await expect
    .poll(
      async () => {
        const { width, height, data } = PNG.sync.read(await p.locator('#avatar').screenshot());
        let pixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 2] > data[i] + 16 && data[i + 2] > data[i + 1] + 6) pixels++;
        }
        return pixels / (width * height);
      },
      { timeout: 45000, message: 'The dressed avatar must be visible on screen' },
    )
    .toBeGreaterThan(0.012);
  if (evidence) await p.screenshot({ path: path.join(evidence, 'wardrobe.png') });
  await go('commands');
  const commandTab = (id) => p.locator('[data-act=commandTab][data-id=' + id + ']').click();
  await expect(p.locator('.commandEmpty')).toBeVisible();
  await commandTab('settings');
  await p.locator('#graphLines').selectOption('angular');
  await expect.poll(async () => (await state()).settings.graphLines).toBe('angular');
  await p.locator('#routineSeconds').fill('1');
  await p.locator('[data-act=saveRoutineLimits]').click();
  await expect.poll(async () => (await state()).settings.routineSeconds).toBe(1);
  await p.locator('[data-act=addBaseCommands]').click();
  await expect
    .poll(async () => (await state()).routines.filter((r) => r.group === 'Базовые команды').length)
    .toBeGreaterThan(0);
  const baseCount = (await state()).routines.length;
  await p.locator('[data-act=addBaseCommands]').click();
  assert.equal((await state()).routines.length, baseCount);
  await p.locator('[data-act=scanCommandApps]').click();
  await expect(p.locator('#modalTitle')).toContainText('меню «Пуск»');
  await close();
  await commandTab('editor');
  await p.locator('#commandQuery').fill('абракадабра');
  await expect(p.locator('#noCommandMatches')).toBeVisible();
  await p.locator('#commandQuery').fill('');
  await p.locator('[data-act=newCommandGroup]').click();
  await p.locator('#commandGroup').fill('Экран');
  await p.locator('[data-act=saveCommandGroup]').click();
  await p.locator('[data-act=groupRoutine][data-id="Экран"]').click();
  await expect(p.locator('#rGroup')).toHaveValue('Экран');
  await p.locator('#rName').fill('Моя команда');
  await commandTab('settings');
  await commandTab('editor');
  await expect(p.locator('#rName')).toHaveValue('Моя команда');
  await expect(p.locator('.wires path').first()).toHaveAttribute('d', / H .* V /);
  await p.locator('#rPhrase').fill('включи напоминалки');
  await p.locator('#kind').selectOption('wait');
  await p.locator('[data-act=addBlock]').click();
  await p.locator('#nodeValue').fill('3');
  await p.locator('[data-act=saveRoutine]').click();
  const controlled = (await state()).routines.find((r) => r.phrase === 'включи напоминалки');
  const timeout = await p.evaluate(async (id) => {
    try {
      await window.desk.call('run', { id });
      return '';
    } catch (e) {
      return e.message;
    }
  }, controlled.id);
  assert.match(timeout, /Истёк лимит времени/);
  await commandTab('settings');
  await p.locator('#routineSeconds').fill('0');
  await p.locator('[data-act=saveRoutineLimits]').click();
  await expect.poll(async () => (await state()).settings.routineSeconds).toBe(0);
  await commandTab('editor');
  await p.locator('[data-act=describeCommand]').click();
  await p.locator('#commandPrompt').fill('Утро: поставь таймер на 25 минут и запиши планы');
  await p.locator('[data-act=generateCommand]').click();
  await expect(p.locator('#rName')).toHaveValue('Утро');
  await p.locator('#rGroup').fill('Работа');
  await p.locator('[data-act=saveRoutine]').click();
  await expect
    .poll(async () => (await state()).routines.some((r) => r.group === 'Работа' && r.blocks.length === 2))
    .toBe(true);
  console.log('Wardrobe and command generation passed');
  await go('desk');
  await p.locator('#panelWidgets').click();
  await p.locator('[data-act=boardEdit]').click();
  const tile = p.locator('[data-tile=notes]'),
    handle = tile.locator('[data-act=boardResize]');
  const initial = await tile.boundingBox(),
    grip = await handle.boundingBox();
  const pitch = await p
    .locator('.deskGrid')
    .evaluate((el) => (el.clientWidth + 12) / Number(getComputedStyle(el).getPropertyValue('--columns')));
  const x = grip.x + grip.width / 2,
    y = grip.y + grip.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x, y - pitch, { steps: 8 });
  await p.mouse.up();
  await expect
    .poll(async () => (await state()).settings.widgets.find((w) => w.id === 'notes').height)
    .toBe(Math.round((initial.height + 12) / pitch) - 1);
  await expect.poll(async () => (await tile.boundingBox()).height).toBeLessThan(initial.height - 20);
  await handle.focus();
  await handle.press('ArrowRight');
  await expect.poll(async () => (await state()).settings.widgets.find((w) => w.id === 'notes').width).toBe(5);
  await p.locator('[data-tile=reminders] [data-act=boardHide]').click();
  await expect(p.locator('[data-tile=reminders]')).toHaveCount(0);
  await p.locator('[data-act=boardAdd]').click();
  await p.locator('[data-widget=reminders]').check();
  await p.locator('[data-act=saveWidgets]').click();
  await expect(p.locator('[data-tile=reminders]')).toHaveCount(1);
  const firstTile = await p.locator('.boardTile').first().getAttribute('data-tile');
  const secondTile = await p.locator('.boardTile').nth(1).getAttribute('data-tile');
  await p.locator('[data-tile="' + firstTile + '"]').dragTo(p.locator('[data-tile="' + secondTile + '"]'));
  await expect.poll(async () => (await state()).settings.widgets[0].id).toBe(secondTile);
  await p.locator('[data-act=boardUp][data-id="' + firstTile + '"]').click();
  await expect.poll(async () => (await state()).settings.widgets[0].id).toBe(firstTile);
  await p.locator('#panelWidgets').click();
  await p.locator('[data-act=boardEdit]').click();
  await expect(p.locator('#content [data-wall-time]')).toHaveText(/\d{2}:\d{2}/);
  await p.locator('#panelWidgets').click();
  await p.locator('#content [data-act=widgets]').click();
  await p.locator('[data-widget=weather]').uncheck();
  const allWidgets = await p
    .locator('#modal [data-widget]')
    .evaluateAll((inputs) => inputs.map((el) => el.dataset.widget));
  const distance = allWidgets.indexOf('tasks') - allWidgets.indexOf('notes');
  assert.ok(distance > 0);
  for (let i = 0; i < distance; i++) await p.locator('[data-act=widgetUp][data-id=tasks]').click();
  await p.locator('[data-act=saveWidgets]').click();
  await expect(p.locator('#content .box h3').first()).toHaveText('Мои задачи');
  await expect(p.locator('#content .box h3', { hasText: 'Погода' })).toHaveCount(0);
  await p.locator('[data-act=add-notes]').click();
  const organizer = p.locator('#organizer'),
    body = p.locator('#noteBody');
  await p.locator('#noteTitle').fill('Черновик');
  await body.fill('Готовая запись');
  await body.press('Control+a');
  await organizer.getByRole('button', { name: 'Полужирный (Ctrl+B)', exact: true }).click();
  await expect.poll(async () => (await state()).notes[0]?.body?.[0]?.tag).toBe('b');
  await organizer.getByRole('button', { name: 'Закрепить заметку', exact: true }).click();
  await expect(organizer.getByRole('button', { name: 'Открепить заметку' })).toBeVisible();
  await organizer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await p.locator('[data-act=edit-notes]').first().click();
  await expect(p.locator('#noteTitle')).toHaveValue('Черновик');
  await expect(body.locator('b')).toHaveText('Готовая запись');
  await body.fill('');
  await body.evaluate((el) => {
    el.focus();
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<p><strong>Формат</strong> <em>сохранён</em></p>');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(body.locator('b,strong')).toHaveText('Формат');
  await expect(body.locator('i,em')).toHaveText('сохранён');
  await body.fill('Текст из редактора');
  await organizer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect.poll(async () => (await state()).notes[0].text).toBe('Черновик\nТекст из редактора');
  await p.locator('[data-act=add-tasks]').click();
  await p.locator('#quickTask').fill('Проверить запись');
  await p.locator('#quickTask').press('Enter');
  await expect.poll(async () => (await state()).tasks.some((t) => t.text === 'Проверить запись')).toBe(true);
  await p.locator('#content [data-act=day][data-id=tasks]').click();
  await organizer.getByRole('button', { name: 'Добавить список' }).click();
  await p.locator('#orgListName').fill('Съёмка');
  await p.locator('#orgListName').press('Enter');
  await expect(organizer.locator('.orgRow[aria-current=true]')).toContainText('Съёмка');
  await organizer.locator('.taskAdd').click();
  await p.locator('#orgTaskText').fill('Настроить свет');
  await p.locator('#orgTaskText').press('Enter');
  await expect(organizer.locator('.taskText')).toHaveText('Настроить свет');
  await organizer.getByRole('button', { name: 'Отметить выполненной' }).click();
  await expect(organizer.locator('.orgTask.done')).toHaveCount(1);
  await organizer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(p.locator('[data-tile=tasks] h3')).toHaveText('Съёмка');
  await p.reload();
  await go('desk');
  await expect(p.locator('[data-tile=tasks] h3')).toHaveText('Съёмка');
  await p.locator('[data-act=edit-notes]').first().click();
  await expect(body).toHaveText('Текст из редактора');
  await expect.poll(async () => (await state()).settings.widgets.find((w) => w.id === 'notes').width).toBe(5);
  await expect(organizer.getByRole('button', { name: 'Открепить заметку' })).toBeVisible();
  await organizer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await p.locator('[data-act=add-events]').click();
  const agenda = p.locator('#agenda'),
    form = agenda.locator('#agendaForm');
  await form.locator('[name=text]').fill('Рабочая сессия');
  await form.locator('summary').click();
  await form.locator('[name=date]').fill(new Date().getFullYear() + 1 + '-09-16');
  await form.locator('[name=time]').fill('10:00');
  await form.locator('[name=repeat]').selectOption('week');
  await form.locator('[name=routine]').selectOption('study-session');
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(async () => (await state()).events[0]?.routineId).toBe('study-session');
  await expect(agenda.locator('.agendaRow')).toContainText('Рабочая сессия');
  await expect(agenda.locator('button[data-ag=day]')).toHaveCount(42);
  await agenda.getByRole('button', { name: 'Предыдущий месяц' }).click();
  await agenda.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect.poll(() => agenda.locator('[data-ag=day].marked').count()).toBeGreaterThan(1);
  await agenda.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await p.locator('#content [data-act=add-reminders]').click();
  await form.locator('[name=text]').fill('Выпить воды');
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(agenda.locator('.reminderText')).toHaveText('Выпить воды');
  await agenda.getByRole('switch').click();
  await expect(agenda.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect
    .poll(async () => (await state()).events.find((e) => e.text === 'Выпить воды')?.disabled)
    .toBe(true);
  await agenda.getByRole('switch').click();
  await expect(agenda.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await agenda.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const dailyAnswer = await p.evaluate(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await window.desk.call('add', {
      kind: 'events',
      category: 'calendar',
      time: +today,
      text: 'Проверка повестки',
    });
    return (await window.desk.call('send', { text: 'Планы на сегодня' })).text;
  });
  assert.match(dailyAnswer, /Проверка повестки/);
  assert.doesNotMatch(dailyAnswer, /Выпить воды/);
  const packfile = path.join(dir, 'work.json');
  await writeFile(
    packfile,
    JSON.stringify({
      id: 'demo-pack',
      name: 'Тест мастерской',
      routines: [{ name: 'Запись с панели', blocks: [{ kind: 'note', value: 'Из панели' }] }],
      contributions: {
        theme: { theme: 'sage', accent: '#506744', glass: true },
        blocks: [{ name: 'Записать с панели', command: 0 }],
        triggers: [{ event: 'reminder', command: 0 }],
        panel: { name: 'Моя панель', body: 'Локальные действия', commands: [0] },
      },
    }),
  );
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, packfile);
  await go('plugins');
  await p.locator('[data-act=importPack]').click();
  await p.locator('[data-act=extensionPanel][data-id=demo-pack]').click();
  await p.locator('[data-act=extensionTheme]').click();
  await expect.poll(async () => (await state()).settings.theme).toBe('sage');
  await p.locator('[data-act=extensionRun]').click();
  await expect.poll(async () => (await state()).notes[0]?.text).toBe('Из панели');
  await p.locator('[data-act=extensionTriggers]').click();
  await expect(p.locator('[data-act=extensionTriggers]')).toHaveText('Остановить триггеры');
  const dest = path.join(dir, 'export.json');
  await app.evaluate(({ dialog }, dest) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: dest });
  }, dest);
  await p.locator('[data-act=exportPack]').click();
  await expect
    .poll(
      async () => JSON.parse(await readFile(dest, 'utf8').catch(() => '{}')).contributions?.triggers[0].event,
    )
    .toBe('reminder');
  const count = (await state()).notes.length;
  await p.evaluate(() =>
    window.desk.call('add', { kind: 'events', text: 'Проверка триггера', time: Date.now() + 900 }),
  );
  await expect.poll(async () => (await state()).notes.length, { timeout: 9000 }).toBe(count + 1);
  await close();
  await go('commands');
  await p.locator('[data-act=edit][data-id=study-session]').click();
  const option = await p
    .locator('#kind option')
    .filter({ hasText: 'Записать с панели' })
    .getAttribute('value');
  await p.locator('#kind').selectOption(option);
  await p.locator('[data-act=addBlock]').click();
  await expect(p.locator('#nodeValue')).toHaveValue('Из панели');
  await go('plugins');
  await p.locator('[data-act=removePack][data-id=demo-pack]').click();
  await expect.poll(async () => (await state()).extensions.some((x) => x.id === 'demo-pack')).toBe(false);
  console.log(
    'Configured widgets, edited note, recurring scheduled action, installed and used an external panel and theme',
  );
  await go('plugins');
  for (const id of ['cat', 'chess', 'shadow', 'freedoom']) {
    await p.locator('[data-act=pluginOn][data-id=' + id + ']').click();
    await expect(p.locator('[data-act=pluginOff][data-id=' + id + ']')).toBeVisible();
    if (id === 'cat') {
      await expect(p.locator('#deskCat')).toBeVisible();
      continue;
    }
    await p.locator('[data-act=panel][data-id=' + id + ']').click();
    const f = p.frameLocator('.gamePanel');
    if (id === 'chess') {
      await f.locator('[data-square=e2]').click();
      await f.locator('[data-square=e4]').click();
      await expect(f.locator('#state')).toHaveText('Твой ход', { timeout: 10000 });
      await expect(f.locator('[data-square=e4]')).toHaveText('♟');
    }
    if (id === 'shadow') {
      await f.locator('#dance').click();
      await expect(f.locator('#stage')).toBeVisible();
    }
    if (id === 'freedoom') {
      await expect
        .poll(async () => Number(await f.locator('canvas').getAttribute('data-frames')), { timeout: 30000 })
        .toBeGreaterThan(10);
      const canvas = f.locator('canvas');
      const waitFrames = async (count) => {
        const n = +(await canvas.getAttribute('data-frames'));
        await expect
          .poll(async () => +(await canvas.getAttribute('data-frames')), { timeout: 15000 })
          .toBeGreaterThan(n + count);
      };
      for (let k = 0; k < 3; k++) {
        await canvas.focus();
        await p.keyboard.down('Enter');
        await waitFrames(3);
        await p.keyboard.up('Enter');
        await waitFrames(10);
      }
      await waitFrames(25);
      await expect(f.locator('#state')).toContainText('Phase 2');
      const before = await canvas.evaluate((c) => c.toDataURL());
      await p.keyboard.down('ArrowRight');
      try {
        await expect
          .poll(() => canvas.evaluate((c, data) => c.toDataURL() !== data, before), {
            timeout: 15000,
            message: 'Turning in the level must change the rendered frame',
          })
          .toBe(true);
      } finally {
        await p.keyboard.up('ArrowRight');
      }
    }
    if (evidence) await p.screenshot({ path: path.join(evidence, id + '.png') });
    await close();
  }
  assert.deepEqual(errors, []);
  console.log('Chess reply, cat, silhouette stage and playable Freedoom passed');
} finally {
  await app?.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 4 });
}
