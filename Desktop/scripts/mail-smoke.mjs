// Isolated IMAP/SMTP round trip on loopback. No external mailbox or credentials required.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import imapkit from 'imapkit';
import { SMTPServer } from 'smtp-server';
import PostalMime from 'postal-mime';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  dir = await mkdtemp(path.join(os.tmpdir(), 'mira-mail-'));
const email = 'test@example.invalid',
  password = randomUUID(),
  deliveries = [];
let app, imap, smtp;
try {
  const ca = path.join(dir, 'ca.pem'),
    keyPath = path.join(dir, 'key.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      keyPath,
      '-out',
      ca,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  const tls = { key: await readFile(keyPath), cert: await readFile(ca) };
  const raw = [
    'From: Inbox <sender@example.invalid>',
    'To: ' + email,
    'Subject: Test incoming',
    'Message-ID: <fixture@example.invalid>',
    'Date: Wed, 18 Nov 2026 09:00:00 +0000',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary=sample',
    '',
    '--sample',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello from the inbox',
    '--sample',
    'Content-Type: text/plain; name=sample.txt',
    'Content-Disposition: attachment; filename=sample.txt',
    'Content-Transfer-Encoding: base64',
    '',
    'dGVzdCBwYXlsb2Fk',
    '--sample',
    'Content-Type: image/png; name=dot.png',
    'Content-Disposition: attachment; filename=dot.png',
    'Content-Transfer-Encoding: base64',
    '',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ksAAAAASUVORK5CYII=',
    '--sample--',
    '',
  ].join('\r\n');
  imap = imapkit({
    secureConnection: true,
    credentials: tls,
    users: { [email]: { password } },
    storage: { INBOX: { messages: [{ raw }] } },
  });
  await new Promise((r) => imap.listen(0, '127.0.0.1', r));
  const imapPort = imap.server.address().port;
  smtp = new SMTPServer({
    ...tls,
    secure: true,
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _s, cb) {
      cb(null, auth.username === email && auth.password === password ? { user: email } : false);
    },
    onData(stream, _s, cb) {
      const chunks = [];
      stream.on('data', (v) => chunks.push(v));
      stream.on('end', () => {
        deliveries.push(Buffer.concat(chunks));
        cb();
      });
    },
  });
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  const smtpPort = smtp.server.address().port;
  const packed = process.env.MIRA_APP_DIR || path.join(root, 'Desktop'),
    executable = process.env.MIRA_ELECTRON || path.join(root, 'build/desktop/Mira/Mira.exe');
  app = await _electron.launch({
    executablePath: executable,
    args:
      process.platform === 'win32'
        ? []
        : [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            packed,
          ],
    env: { ...process.env, MIRA_TEST_PROFILE: path.join(dir, 'profile'), NODE_EXTRA_CA_CERTS: ca },
  });
  const p = await app.firstWindow();
  p.setDefaultTimeout(10000);
  await p.locator('#introSkip').click();
  const api = (op, arg) => p.evaluate(([op, arg]) => window.desk.call(op, arg), [op, arg]);
  await p.locator('[data-go=desk]').first().click();
  await p.locator('#panelWidgets').click();
  await p.locator('#boardMenu [data-act=widgets]').click();
  await p.locator('[data-widget=mail]').check();
  await p.locator('[data-act=saveWidgets]').click();
  await p.locator('[data-tile=mail] header [data-act=day]').click();
  const d = p.locator('#mailDialog'),
    f = d.locator('#mailForm');
  await d.getByRole('button', { name: 'Добавить ящик' }).click();
  await f.locator('[name=provider]').selectOption('custom');
  for (const [name, value] of Object.entries({
    email,
    password,
    host: '127.0.0.1',
    port: String(imapPort),
    smtpHost: '127.0.0.1',
    smtpPort: String(smtpPort),
  }))
    await f.locator('[name=' + name + ']').fill(value);
  await d.locator('[data-mail=test]').click();
  await expect(d.locator('#mailStatus')).toHaveText('Подключение работает', { timeout: 15000 });
  await f.getByRole('button', { name: 'Сохранить' }).click();
  await d.locator('[data-mail=refresh]').click();
  const row = d.locator('.mailRow');
  await expect(row).toHaveAttribute('data-unread', 'true');
  await row.click();
  await expect(d.locator('.mailText')).toContainText('Hello from the inbox');
  const dest = path.join(dir, 'download.txt');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, dest);
  await d.locator('[data-mail=preview]').click();
  await expect.poll(() => d.locator('.mailPreview img').evaluate((el) => el.naturalWidth)).toBe(1);
  await d.locator('[data-mail=zoomIn]').click();
  await d.locator('[data-mail=fit]').click();
  await d.locator('[data-mail=backMessage]').click();
  await d.locator('[data-mail=export]').first().click();
  await expect.poll(() => readFile(dest, 'utf8').catch(() => null)).toBe('test payload');
  await d.locator('[data-mail=forward]').click();
  await d.locator('[name=to]').fill('recipient@example.invalid');
  const source = path.join(dir, 'original.txt');
  await writeFile(source, 'local fixture');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, source);
  await d.locator('[data-mail=attach]').click();
  await expect(d.locator('#mailParts')).toContainText('original.txt');
  await d.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => deliveries.length).toBe(1);
  const sent = await PostalMime.parse(deliveries[0]);
  assert.equal(sent.subject, 'Fwd: Test incoming');
  assert.equal(sent.attachments.length, 3);
  assert.equal(sent.to[0].address, 'recipient@example.invalid');
  await expect(row).toHaveAttribute('data-unread', 'false');
  await row.click();
  await d.locator('[data-mail=reply]').click();
  await expect(d.locator('[name=to]')).toHaveValue('sender@example.invalid');
  await d.locator('[data-mail=cancelCompose]').click();
  await new Promise((r) => imap.close(r));
  imap = null;
  await row.click();
  await expect(d.locator('.mailText')).toContainText('Hello from the inbox');
  await d.locator('#mailClose').click();
  await p.locator('#content [data-act=add-notes]').click();
  const n = p.locator('#organizer');
  await n.locator('[data-org=attach]').click();
  await expect(n.locator('.noteFile')).toContainText('original.txt');
  await rm(source);
  await n.locator('[data-org=export]').click();
  await expect.poll(() => readFile(dest, 'utf8')).toBe('local fixture');
  await n.locator('[data-org=detach]').click();
  await expect(n.locator('.noteFile')).toHaveCount(0);
  assert.ok(!(await readFile(path.join(dir, 'profile/desk.json'), 'utf8')).includes(password));
  console.log(
    'Live loopback IMAP/SMTP: unread inbox, open, download, image preview and forward with three attachments, reply recipient and offline open passed. Note files survived removal of the original.',
  );
} finally {
  await app?.close();
  if (imap) await new Promise((r) => imap.close(r));
  if (smtp) await new Promise((r) => smtp.close(r));
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
