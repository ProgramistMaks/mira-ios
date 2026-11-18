const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ImapFlow } = require('imapflow');
const PostalMime = require('postal-mime');
const nodemailer = require('nodemailer');
const { convert } = require('html-to-text');

const MiB = 1024 * 1024,
  large = 5 * MiB,
  maximum = 32 * MiB,
  week = 7 * 86400000;
const providers = {
  gmail: ['Gmail', 'imap.gmail.com', 'smtp.gmail.com', 'https://mail.google.com/'],
  yandex: ['Яндекс Почта', 'imap.yandex.ru', 'smtp.yandex.ru', 'https://mail.yandex.ru/'],
  mailru: ['Mail.ru', 'imap.mail.ru', 'smtp.mail.ru', 'https://e.mail.ru/'],
  icloud: ['iCloud Mail', 'imap.mail.me.com', 'smtp.mail.me.com', 'https://www.icloud.com/mail/'],
  custom: ['Другой (IMAP)', '', '', ''],
};
function mailboxAddress(value) {
  const email = String(value || '').trim();
  if (
    !/^[^\s<>@,;:()\u0000-\u001f]+@[^\s<>@,;:()\u0000-\u001f]+\.[^\s<>@,;:()\u0000-\u001f]+$/u.test(email) ||
    email.length > 254
  )
    throw Error('Проверь адрес почты');
  return email;
}
function host(value) {
  const name = String(value || '')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(name)) throw Error('Укажи имя почтового сервера');
  return name;
}
function number(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw Error(label);
  return n;
}
function config(input) {
  if (!Object.hasOwn(providers, input.provider)) throw Error('Выбери почтовый сервис');
  const p = providers[input.provider],
    custom = input.provider === 'custom';
  return {
    provider: input.provider,
    email: mailboxAddress(input.email),
    host: host(custom ? input.host : p[1]),
    port: custom ? number(input.port, 1, 65535, 'Проверь порт IMAP') : 993,
    smtpHost: custom ? (input.smtpHost ? host(input.smtpHost) : '') : p[2],
    smtpPort: custom ? number(input.smtpPort || 465, 1, 65535, 'Проверь порт SMTP') : 465,
    smtpStartTLS: custom && !!input.smtpStartTLS,
    every: number(input.every ?? 5, 1, 1440, 'Интервал проверки — от 1 до 1440 минут'),
    limit: number(input.limit ?? 20, 1, 100, 'Можно показывать от 1 до 100 писем'),
    cache: input.cache !== false,
  };
}
const identity = (a) => JSON.stringify([a.email, a.host, a.port, a.smtpHost, a.smtpPort, a.smtpStartTLS]);
const address = (a) => a?.address || '';
const display = (a) => a?.name || address(a) || 'Неизвестный отправитель';
function filename(s) {
  return (
    String(s || 'Вложение')
      .split(/[/\\]/)
      .pop() || 'Вложение'
  )
    .replace(/[\u0000-\u001f<>:"|?*]/g, '_')
    .slice(0, 160);
}
function imageType(bytes) {
  if (bytes.length > 12 * MiB) return '';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return '';
}
function parsedBody(raw) {
  return PostalMime.parse(raw).then((m) => ({
    subject: m.subject || 'Без темы',
    from: display(m.from),
    sender: address(m.from),
    replyTo: address(m.replyTo?.[0]) || address(m.from),
    to: (m.to || []).map((a) => (a.name ? a.name + ' <' + address(a) + '>' : address(a))).join(', '),
    date: m.date || '',
    messageId: m.messageId || '',
    references: m.references || '',
    text: (
      m.text || convert(m.html || '', { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] })
    ).slice(0, 1000000),
    attachments: (m.attachments || []).map((a, index) => ({
      index,
      name: filename(a.filename),
      data: Buffer.from(a.content),
    })),
  }));
}
async function connection(box, password, fn, options = {}) {
  if (!password) throw Error('Укажи пароль приложения');
  const client = new ImapFlow({
    host: box.host,
    port: box.port,
    secure: true,
    auth: { user: box.email, pass: password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 25000,
    ...options,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    return await fn(client);
  } finally {
    client.close();
  }
}
class Mail {
  constructor(store, vault, notify, transport = connection, smtp = nodemailer.createTransport) {
    this.store = store;
    this.vault = vault;
    this.notify = notify;
    this.transport = transport;
    this.smtp = smtp;
    this.boxes = store.data.mailBoxes ??= [];
    this.index = store.data.mailIndex ??= {};
    this.root = path.join(store.dir, 'mail-cache');
    this.queues = new Map();
    this.polls = new Map();
    this.status = new Map();
    this.opened = new Map();
    this.outgoing = new Map();
    this.next = new Map();
    this.stopped = false;
    this.nextPrune = Date.now() + 3600000;
  }
  box(id) {
    const b = this.boxes.find((b) => b.id === id);
    if (!b) throw Error('Ящик удалён');
    return b;
  }
  assertCurrent(box) {
    if (this.stopped || !this.boxes.includes(box)) throw Error('Настройки ящика изменились');
  }
  rows(id) {
    return this.index[id]?.rows || [];
  }
  overview() {
    return {
      providers: Object.fromEntries(Object.entries(providers).map(([id, p]) => [id, p[0]])),
      boxes: this.boxes.map((b) => ({
        ...b,
        hasPassword: this.vault.has(b.id),
        web: providers[b.provider][3],
        status: this.status.get(b.id) || '',
        inbox: this.index[b.id] || { rows: [] },
      })),
    };
  }
  widget() {
    const rows = this.boxes
      .flatMap((b) => this.rows(b.id).map((r) => ({ ...r, box: b.id })))
      .sort((a, b) => b.time - a.time);
    return {
      boxes: this.boxes.length,
      unread: rows.filter((r) => !r.seen).length,
      latest: rows[0]?.subject || '',
    };
  }
  credential(b, input) {
    if (input.password) return String(input.password);
    if (input.id) {
      const old = this.box(input.id);
      if (identity(old) === identity(b)) return this.vault.get(old.id);
    }
    throw Error('Введи пароль приложения для этого адреса и сервера');
  }
  async test(input) {
    const b = config(input),
      pass = this.credential(b, input);
    await this.transport(b, pass, (c) => c.mailboxOpen('INBOX', { readOnly: true }));
  }
  save(input) {
    const settings = config(input),
      old = input.id ? this.box(input.id) : null;
    const pass = this.credential(settings, input);
    if (!pass) throw Error('Укажи пароль приложения');
    const reset = !old || identity(settings) !== identity(old);
    const b = {
      ...settings,
      id: old?.id || randomUUID(),
      cacheId: !reset && settings.cache === old.cache ? old.cacheId : randomUUID(),
    };
    if (input.password || !old) this.vault.set(b.id, pass);
    if (old) this.boxes.splice(this.boxes.indexOf(old), 1, b);
    else this.boxes.push(b);
    if (reset) delete this.index[b.id];
    if (old && old.cacheId !== b.cacheId) this.discard(old);
    this.status.delete(b.id);
    this.next.set(b.id, 0);
    this.store.save();
    this.notify();
    return b.id;
  }
  discard(b) {
    this.opened.delete(b.id);
    return fs.rm(path.join(this.root, b.cacheId), { recursive: true, force: true }).catch(() => {});
  }
  async remove(id) {
    const b = this.box(id);
    this.boxes.splice(this.boxes.indexOf(b), 1);
    delete this.index[id];
    this.status.delete(id);
    this.next.delete(id);
    this.vault.remove(id);
    this.store.save();
    await this.discard(b);
    this.notify();
  }
  enqueue(id, fn) {
    const b = this.box(id),
      previous = this.queues.get(id) || Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(() => {
        this.assertCurrent(b);
        return fn(b);
      });
    this.queues.set(id, task);
    task
      .finally(() => {
        if (this.queues.get(id) === task) this.queues.delete(id);
      })
      .catch(() => {});
    return task;
  }
  refresh(id) {
    const box = this.box(id),
      running = this.polls.get(id);
    if (running?.box === box) return running.task;
    const task = this.enqueue(id, async (b) => {
      try {
        const snapshot = await this.transport(b, this.vault.get(id), async (c) => {
          const folder = await c.mailboxOpen('INBOX', { readOnly: true });
          const rows = folder.exists
            ? await c.fetchAll(Math.max(1, folder.exists - b.limit + 1) + ':*', {
                uid: true,
                flags: true,
                envelope: true,
                size: true,
                internalDate: true,
              })
            : [];
          return {
            valid: String(folder.uidValidity),
            updated: Date.now(),
            rows: rows
              .map((m) => ({
                uid: m.uid,
                subject: m.envelope?.subject || 'Без темы',
                from: display(m.envelope?.from?.[0]),
                time: +new Date(m.envelope?.date || m.internalDate) || 0,
                seen: m.flags?.has('\\Seen') || false,
                size: m.size || 0,
              }))
              .sort((a, b) => b.uid - a.uid),
          };
        });
        this.assertCurrent(b);
        this.index[id] = snapshot;
        this.status.delete(id);
        this.store.save();
      } catch (e) {
        if (this.boxes.includes(b))
          this.status.set(
            id,
            e.authenticationFailed ? 'Сервер отклонил пароль приложения' : 'Не удалось проверить входящие',
          );
        throw e;
      } finally {
        if (this.boxes.includes(b)) {
          this.next.set(id, Date.now() + b.every * 60000);
          this.notify();
        }
      }
    });
    this.polls.set(id, { task, box });
    task
      .finally(() => {
        if (this.polls.get(id)?.task === task) this.polls.delete(id);
      })
      .catch(() => {});
    return task;
  }
  tick() {
    if (this.stopped) return;
    if (Date.now() >= this.nextPrune) {
      this.nextPrune = Date.now() + 3600000;
      this.prune().catch(() => {});
    }
    for (const b of this.boxes)
      if (this.vault.has(b.id) && (this.next.get(b.id) || 0) <= Date.now())
        this.refresh(b.id).catch(() => {});
  }
  ref(id, valid, uid) {
    const b = this.box(id),
      index = this.index[id],
      row = index?.rows.find((r) => r.uid === uid);
    if (!row || index.valid !== valid || !/^\d+$/.test(valid) || !Number.isSafeInteger(uid) || uid < 1)
      throw Error('Обнови список писем');
    return { b, row, file: path.join(this.root, b.cacheId, valid + '-' + uid + '.eml') };
  }
  async cached(file) {
    try {
      const stat = await fs.stat(file);
      if (stat.size <= maximum && Date.now() - stat.mtimeMs < week) return await fs.readFile(file);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  async prune() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const folders = new Set(this.boxes.filter((b) => b.cache).map((b) => b.cacheId));
    for (const dir of await fs.readdir(this.root)) {
      const folder = path.join(this.root, dir);
      if (!folders.has(dir)) {
        await fs.rm(folder, { recursive: true, force: true });
        continue;
      }
      for (const name of await fs.readdir(folder)) {
        const file = path.join(folder, name),
          s = await fs.stat(file).catch(() => null);
        if (
          s &&
          (Date.now() - s.mtimeMs >= week || (name.endsWith('.tmp') && Date.now() - s.mtimeMs > 3600000))
        )
          await fs.rm(file, { force: true });
      }
    }
  }
  async open({ id, valid, uid, allowLarge = false }) {
    return this.enqueue(id, async (b) => {
      const { row, file } = this.ref(id, valid, uid);
      if (row.size > maximum) throw Error('Письмо больше 32 МБ. Открой его в веб-почте.');
      const local = b.cache ? await this.cached(file) : null;
      let raw = local;
      if (!raw && row.size > large && !allowLarge) return { large: row.size };
      let offline = false;
      if (!raw || !row.seen) {
        try {
          await this.transport(b, this.vault.get(id), async (c) => {
            const folder = await c.mailboxOpen('INBOX');
            if (String(folder.uidValidity) !== valid) throw Error('Обнови список писем');
            if (!raw) {
              const result = await c.fetchOne(
                uid,
                { source: { start: 0, maxLength: maximum + 1 } },
                { uid: true },
              );
              if (!result?.source || result.source.length > maximum)
                throw Error('Не удалось загрузить письмо целиком');
              raw = result.source;
            }
            this.assertCurrent(b);
            await c.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
          });
          this.assertCurrent(b);
          row.seen = true;
          this.store.save();
        } catch (e) {
          if (!local || e.message === 'Обнови список писем') throw e;
          offline = true;
        }
      }
      this.assertCurrent(b);
      const msg = await parsedBody(raw);
      this.assertCurrent(b);
      if (b.cache && !local) {
        const tmp = file + '.' + randomUUID() + '.tmp';
        await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        try {
          await fs.writeFile(tmp, raw, { mode: 0o600 });
          this.assertCurrent(b);
          await fs.rename(tmp, file);
        } finally {
          await fs.rm(tmp, { force: true }).catch(() => {});
        }
      }
      this.assertCurrent(b);
      this.opened.set(id, { uid, valid, msg });
      this.notify();
      return {
        ...msg,
        offline,
        attachments: msg.attachments.map(({ index, name, data }) => ({
          index,
          name,
          size: data.length,
          preview: imageType(data),
        })),
      };
    });
  }
  async readAll(id) {
    return this.enqueue(id, async (b) => {
      const valid = this.index[id]?.valid;
      await this.transport(b, this.vault.get(id), async (c) => {
        const f = await c.mailboxOpen('INBOX');
        if (valid && String(f.uidValidity) !== valid) throw Error('Обнови список писем');
        this.assertCurrent(b);
        if (f.exists) await c.messageFlagsAdd('1:*', ['\\Seen']);
      });
      this.assertCurrent(b);
      for (const r of this.rows(id)) r.seen = true;
      this.store.save();
      this.notify();
    });
  }
  attachment({ id, uid, valid, index }) {
    this.box(id);
    const open = this.opened.get(id);
    if (
      !open ||
      open.uid !== uid ||
      open.valid !== valid ||
      !Number.isInteger(index) ||
      !open.msg.attachments[index]
    )
      throw Error('Открой письмо ещё раз');
    return open.msg.attachments[index];
  }
  preview(ref) {
    const a = this.attachment(ref);
    const mime = imageType(a.data);
    if (!mime) throw Error('Предпросмотр недоступен');
    return { mime, bytes: a.data };
  }
  async attach(files) {
    const added = [];
    for (const file of files) {
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > 25 * MiB) throw Error('Вложение должно быть файлом до 25 МБ');
      added.push({ id: randomUUID(), file, name: filename(file), size: stat.size });
    }
    for (const a of added) this.outgoing.set(a.id, a);
    return added.map(({ id, name, size }) => ({ id, name, size }));
  }
  release(ids) {
    for (const id of ids) this.outgoing.delete(id);
  }
  async send({ id, to, subject, text, files = [], forward = [], reply }) {
    const b = this.box(id);
    if (!b.smtpHost) throw Error('Укажи сервер SMTP в настройках ящика');
    const recipients = String(to || '')
      .split(/[,;]/)
      .map(mailboxAddress);
    if (!recipients.length || recipients.length > 50) throw Error('Проверь получателей');
    const ids = [...new Set(files)],
      attachments = [];
    let bytes = 0;
    for (const fid of ids) {
      const a = this.outgoing.get(fid);
      if (!a) throw Error('Выбери вложение ещё раз');
      const handle = await fs.open(a.file, 'r');
      try {
        const s = await handle.stat();
        if (!s.isFile() || s.size !== a.size || bytes + s.size > 25 * MiB)
          throw Error('Размер вложений изменился или превышает 25 МБ');
        bytes += s.size;
        attachments.push({ filename: a.name, content: await handle.readFile() });
      } finally {
        await handle.close();
      }
    }
    for (const part of forward) {
      const a = this.attachment({ ...part, id });
      bytes += a.data.length;
      if (bytes > 25 * MiB) throw Error('Вложения превышают 25 МБ');
      attachments.push({ filename: a.name, content: a.data });
    }
    this.assertCurrent(b);
    const smtp = this.smtp({
      host: b.smtpHost,
      port: b.smtpPort,
      secure: !b.smtpStartTLS,
      requireTLS: b.smtpStartTLS,
      auth: { user: b.email, pass: this.vault.get(id) },
      connectionTimeout: 12000,
      socketTimeout: 30000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const opened = this.opened.get(id);
      const parent = reply && opened?.valid === reply.valid && opened?.uid === reply.uid ? opened.msg : null;
      const result = await smtp.sendMail({
        from: b.email,
        to: recipients,
        subject: String(subject || '')
          .replace(/[\r\n]/g, ' ')
          .slice(0, 998),
        text: String(text || ''),
        attachments,
        ...(parent?.messageId
          ? {
              inReplyTo: parent.messageId,
              references: [parent.references, parent.messageId].filter(Boolean).join(' '),
            }
          : {}),
      });
      this.release(ids);
      return { rejected: (result.rejected || []).map(String) };
    } finally {
      smtp.close();
    }
  }
}
module.exports = { Mail, config, providers, filename };
