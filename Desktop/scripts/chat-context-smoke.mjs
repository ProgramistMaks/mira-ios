// Check the composer and actual HTTP payloads at a local compatible test server.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from '@e965/xlsx';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-chat-')),
  profile = path.join(tmp, 'profile');
const requests = [];
let finishStream;
let app;
const server = http.createServer(async (req, res) => {
  const parts = [];
  for await (const chunk of req) parts.push(chunk);
  requests.push(JSON.parse(Buffer.concat(parts)));
  if (
    requests.at(-1).messages.at(-1).content === 'Проверь поток' ||
    requests.at(-1).messages.at(-1).content === 'Останови выдачу'
  ) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (text) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n';
    res.write(chunk('Первая часть'));
    finishStream = () => res.end(chunk(' и вторая.') + 'data: [DONE]\n\n');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: 'Получила материалы.' } }] }));
});
try {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
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
  const p = await app.firstWindow(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const state = () => p.evaluate(() => window.desk.call('state'));
  await p.locator('#introSkip').click();
  await p.evaluate(
    (port) =>
      window.desk.call('settings', {
        provider: 'endpoint',
        base: 'http://127.0.0.1:' + port + '/v1',
        cloudModel: 'test-vision',
      }),
    server.address().port,
  );
  const input = p.locator('#prompt'),
    menu = p.locator('#slashMenu');
  await input.fill('Оставь этот текст');
  await p.locator('#slash').click();
  await expect(menu.getByRole('option')).toHaveCount(7);
  await menu.locator('[data-key=refine]').click();
  await expect(input).toHaveValue('/refine Оставь этот текст');
  await input.fill('/su');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await input.press('Tab');
  await expect(input).toHaveValue('/summary ');
  await input.fill('/think high');
  await input.press('Enter');
  await expect.poll(async () => (await state()).chats[0]?.reasoning).toBe('high');
  assert.equal(requests.length, 0);
  const files = [];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Город', 'Цена'],
      ['Тула', 42],
    ]),
    'Продажи',
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['План'], [100]]), 'Июнь');
  for (const ext of ['xlsx', 'xls', 'ods']) {
    const file = path.join(tmp, 'книга.' + ext);
    await fs.writeFile(file, XLSX.write(wb, { type: 'buffer', bookType: ext }));
    files.push(file);
  }
  files.push(path.join(root, 'Desktop/ui/icon.png'));
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, files);
  await p.locator('#attach').click();
  await expect(p.locator('#attachment [data-remove]')).toHaveCount(4, { timeout: 25000 });
  await input.evaluate((el) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['let choice = 42;'], 'main.swift', { type: 'text/plain' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(p.locator('#attachment [data-remove]')).toHaveCount(5);
  const formats = await p.locator('#attachment').innerText();
  assert.match(formats, /main\.swift/);
  await input.fill('/summary Сравни планы и сделки');
  await input.press('Enter');
  await expect.poll(async () => (await state()).chats[0]?.messages.at(-1)?.text).toBe('Получила материалы.');
  assert.equal(requests[0].reasoning_effort, 'high');
  const parts = requests[0].messages.at(-1).content;
  assert.match(parts[0].text, /краткое резюме/);
  assert.equal(parts[0].text.match(/Тула\t42/g)?.length, 3);
  assert.match(parts[0].text, /Июнь/);
  assert.match(parts[0].text, /let choice/);
  assert.match(parts[1].image_url.url, /^data:image\/jpeg;base64,/);
  const msg = (await state()).chats[0].messages.find((m) => m.attachments),
    img = msg.attachments.find((a) => a.kind === 'image');
  assert.ok(img.id && !img.data);
  await p.locator('[data-act=editTurn]').last().click();
  await p.locator('#revisionText').fill('/summary Проверь цену ещё раз');
  await p.locator('[data-act=applyRevision]').click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(p.locator('[data-act=redoTurn]').last()).toBeVisible();
  assert.match(requests[1].messages.at(-1).content[0].text, /Проверь цену/);
  assert.equal(requests[1].messages.at(-1).content[1].image_url.url, parts[1].image_url.url);
  await p.locator('[data-act=redoTurn]').last().click();
  await expect.poll(() => requests.length).toBe(3);
  await expect(p.locator('[data-act=redoTurn]').last()).toBeVisible();
  await p.reload();
  await p.locator('#recentChat').click();
  await p.locator('.chatImage').click();
  await expect.poll(() => p.locator('.fullChatImage').evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
  await p.evaluate(() => document.querySelector('#modal').close());
  await input.fill('/screen Что на экране?');
  await input.press('Enter');
  await expect(p.locator('#attachment img')).toBeVisible();
  assert.equal(requests.length, 3);
  await p.locator('#attachment [data-remove]').click();
  await p.locator('#newChat').click();
  await input.fill('/think');
  await input.press('Escape');
  await input.press('Enter');
  await expect.poll(async () => (await state()).chats[0]?.messages.at(-1)?.text).toContain('auto');
  assert.equal(requests.length, 3);
  const id = (await state()).chats.find((c) => c.messages.some((m) => m.attachments)).id;
  await p.evaluate((id) => window.desk.call('deleteChat', { id }), id);
  await assert.rejects(fs.stat(path.join(profile, 'chat-images', img.id)), { code: 'ENOENT' });
  await input.fill('Проверь поток');
  await input.press('Enter');
  await expect(p.locator('#liveReply')).toHaveText('Первая часть');
  finishStream();
  await expect.poll(async () => (await state()).chats[0].messages.at(-1).text).toBe('Первая часть и вторая.');
  await expect(p.locator('#send')).toHaveAttribute('title', 'Отправить');
  await input.fill('Останови выдачу');
  await input.press('Enter');
  await expect(p.locator('#liveReply')).toHaveText('Первая часть');
  await p.locator('#send').click();
  await expect.poll(async () => (await state()).chats[0].messages.at(-1).stopped).toBe(true);
  assert.deepEqual(errors, []);
  console.log(
    'Seven slash actions listed; keyboard selection, per-chat reasoning, XLS/XLSX/ODS, source drop, images, stored preview, screenshot confirmation and deletion passed.',
  );
} finally {
  await app?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 4 });
}
