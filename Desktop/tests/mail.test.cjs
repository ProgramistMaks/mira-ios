const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, readdir } = require('node:fs/promises');
const path = require('node:path'),
  os = require('node:os');
const { Mail } = require('../mail.cjs');
test('mailbox metadata survives restart, cached mail is scoped to UIDVALIDITY and removing an account clears its credentials and files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mira-mail-index-')),
    store = { dir, data: {}, save() {} };
  const keys = new Map(),
    vault = {
      has: (id) => keys.has(id),
      get: (id) => keys.get(id),
      set: (id, v) => keys.set(id, v),
      remove: (id) => keys.delete(id),
    };
  let generation = 1,
    body = 'First message',
    seen = false,
    net = true;
  const transport = async (_b, _pass, fn) => {
    if (!net) throw Error('offline');
    return fn({
      mailboxOpen: async () => ({ exists: 1, uidValidity: generation }),
      fetchAll: async () => [{ uid: 1, envelope: { subject: body }, flags: new Set(seen ? ['\\Seen'] : []) }],
      fetchOne: async () => ({ source: Buffer.from('Content-Type: text/plain\r\n\r\n' + body) }),
      messageFlagsAdd: async () => {
        seen = true;
      },
    });
  };
  const create = () => new Mail(store, vault, () => {}, transport);
  const settings = {
    provider: 'custom',
    email: 'a@example.invalid',
    host: 'imap.example.invalid',
    port: 993,
    smtpHost: 'smtp.example.invalid',
    smtpPort: 465,
  };
  try {
    let mail = create();
    const id = mail.save({ ...settings, password: 'fixture-password' });
    await mail.refresh(id);
    assert.equal(seen, false);
    assert.equal((await mail.open({ id, valid: '1', uid: 1 })).text.trimEnd(), 'First message');
    assert.equal(seen, true);
    assert.throws(() => mail.save({ ...settings, id, host: 'new.example.invalid' }), /пароль/);
    mail = create();
    net = false;
    assert.equal((await mail.open({ id, uid: 1, valid: '1' })).text.trimEnd(), 'First message');
    generation = 2;
    body = 'Different message';
    net = true;
    seen = false;
    await mail.refresh(id);
    await assert.rejects(mail.open({ id, uid: 1, valid: '1' }), /Обнови/);
    assert.equal((await mail.open({ id, valid: '2', uid: 1 })).text.trimEnd(), body);
    await mail.remove(id);
    assert.equal(keys.size, 0);
    assert.deepEqual(await readdir(path.join(dir, 'mail-cache')), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
