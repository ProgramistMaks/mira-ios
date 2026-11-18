const { randomBytes } = require('node:crypto');
const { setTimeout: wait } = require('node:timers/promises');
const { response, post } = require('./network.cjs');
class Telegram {
  constructor(store, token, handle, notify) {
    Object.assign(this, { store, token, handle, notify });
  }
  async api(method, args, signal) {
    const key = this.token();
    if (!/^\d+:[\w-]+$/.test(key)) throw Error('Проверьте токен Telegram');
    const d = await (
      await response('https://api.telegram.org/bot' + key + '/' + method, { ...post(args), signal }, 35000)
    ).json();
    if (!d.ok) throw Error('Ошибка Telegram');
    return d.result;
  }
  async pair() {
    const me = await this.api('getMe', {});
    this.pairCode = randomBytes(12).toString('hex');
    this.expires = Date.now() + 300000;
    this.listen();
    return { bot: me.username, code: this.pairCode };
  }
  stop() {
    this.controller?.abort();
    this.controller = null;
    this.pairCode = '';
  }
  listen() {
    if (this.controller) return;
    this.controller = new AbortController();
    this.loop(this.controller.signal).catch(() => {});
  }
  async loop(signal) {
    while (!signal.aborted) {
      try {
        const updates = await this.api(
          'getUpdates',
          { offset: this.store.data.telegramOffset, timeout: 22, allowed_updates: ['message'] },
          signal,
        );
        for (const u of updates) {
          if (signal.aborted) return;
          this.store.data.telegramOffset = u.update_id + 1;
          this.store.save();
          const m = u.message;
          if (!m || m.chat?.type !== 'private' || String(m.from?.id) !== String(m.chat.id)) continue;
          const id = String(m.chat.id);
          let reply = '';
          if (this.pairCode && Date.now() < this.expires && m.text === '/start ' + this.pairCode) {
            this.store.data.pairedChat = id;
            this.store.save();
            this.pairCode = '';
            this.notify({ type: 'refresh' });
            reply = 'Мира подключена. Команды можно отправлять сюда.';
          } else if (id === this.store.data.pairedChat) {
            try {
              let text = m.text || '';
              if (m.voice) {
                if (m.voice.file_size > 6e6 || m.voice.duration > 90)
                  throw Error('Сообщение длиннее 90 секунд');
                const f = await this.api('getFile', { file_id: m.voice.file_id }, signal);
                const r = await response(
                  'https://api.telegram.org/file/bot' + this.token() + '/' + f.file_path,
                  { signal },
                );
                text = await this.handle('voice', Buffer.from(await r.arrayBuffer()), signal);
              }
              if (text) reply = await this.handle('text', text, signal);
            } catch (e) {
              reply = e.message;
            }
          }
          if (reply)
            await this.api('sendMessage', { chat_id: id, text: String(reply).slice(0, 4000) }, signal);
        }
      } catch (e) {
        if (!signal.aborted) await wait(4000, undefined, { signal }).catch(() => {});
      }
    }
  }
}
module.exports = { Telegram };
