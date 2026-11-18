const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { parseCommand } = require('./ui/chat-commands.mjs');
const imageId = /^[a-f\d-]{36}\.jpg$/;
function previewImage(image, name) {
  if (!image || image.isEmpty()) throw Error('Не удалось прочитать изображение');
  const { width, height } = image.getSize();
  if (Math.max(width, height) > 1280)
    image = image.resize(
      width >= height ? { width: 1280, quality: 'best' } : { height: 1280, quality: 'best' },
    );
  return { name, kind: 'image', data: 'data:image/jpeg;base64,' + image.toJPEG(85).toString('base64') };
}
class ChatMedia {
  constructor(dir) {
    this.dir = path.join(dir, 'chat-images');
  }
  file(id) {
    if (!imageId.test(id)) throw Error('Неизвестное изображение');
    return path.join(this.dir, id);
  }
  async save(items = []) {
    if (!Array.isArray(items) || items.length > 8) throw Error('Можно приложить до восьми файлов');
    const saved = [];
    let chars = 0,
      images = 0;
    try {
      for (const item of items) {
        const name = String(item.name || 'Вложение').slice(0, 180);
        if (item.kind !== 'image') {
          const text = String(item.text || '');
          chars += text.length;
          if (!text.trim() || chars > 45000)
            throw Error('В приложенных документах должно быть от 1 до 45 000 знаков');
          saved.push({ kind: 'text', name, text });
          continue;
        }
        if (
          ++images > 4 ||
          typeof item.data !== 'string' ||
          item.data.length > 4500000 ||
          !item.data.startsWith('data:image/jpeg;base64,')
        )
          throw Error('Можно приложить до четырёх изображений до 3 МБ каждое');
        const bytes = Buffer.from(item.data.slice(23), 'base64');
        if (
          bytes.length < 4 ||
          bytes.length > 3 * 1024 * 1024 ||
          bytes.readUInt16BE(0) !== 0xffd8 ||
          bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
        )
          throw Error('Некорректный файл JPEG');
        const id = randomUUID() + '.jpg';
        await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
        saved.push({ kind: 'image', name, id });
        await fs.writeFile(this.file(id), bytes, { mode: 0o600, flag: 'wx' });
      }
      return saved;
    } catch (e) {
      await this.remove(saved);
      throw e;
    }
  }
  async remove(items) {
    for (const item of items || [])
      if (item.kind === 'image') await fs.rm(this.file(item.id), { force: true });
  }
  async messages(chat) {
    const rows = chat.messages.filter((m) => !m.error && !m.control).slice(-16);
    const recentImages = new Set(
      rows.flatMap((m) => (m.attachments || []).filter((a) => a.kind === 'image').map((a) => a.id)).slice(-4),
    );
    return Promise.all(
      rows.map(async (m) => {
        const cmd = m.role === 'user' && parseCommand(m.text);
        let text =
          cmd && cmd.key !== 'think'
            ? [
                cmd.instruction,
                cmd.argument || 'Используй приложенный материал или предыдущие сообщения разговора.',
              ].join('\n')
            : m.text;
        const parts = [];
        for (const a of m.attachments || []) {
          if (a.kind === 'text') {
            text += '\n\nДокумент «' + a.name + '»\n' + a.text;
            continue;
          }
          if (recentImages.has(a.id))
            parts.push({
              type: 'image_url',
              image_url: {
                url: 'data:image/jpeg;base64,' + (await fs.readFile(this.file(a.id))).toString('base64'),
              },
            });
          else text += '\n[Изображение: ' + a.name + ']';
        }
        return { role: m.role, content: parts.length ? [{ type: 'text', text }, ...parts] : text };
      }),
    );
  }
}
module.exports = { ChatMedia, previewImage };
