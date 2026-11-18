const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
class NoteFiles {
  constructor(store, changed) {
    this.store = store;
    this.changed = changed;
    this.dir = path.join(store.dir, 'note-files');
  }
  note(id) {
    const row = this.store.data.notes.find((n) => n.id === id);
    if (!row) throw Error('Заметка удалена');
    return row;
  }
  file(id) {
    if (!/^[a-f\d-]{36}$/i.test(id)) throw Error('Неизвестное вложение');
    return path.join(this.dir, id);
  }
  async attach(id, selected) {
    const n = this.note(id),
      copied = [];
    try {
      await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
      for (const src of selected) {
        const stat = await fs.stat(src);
        if (!stat.isFile() || stat.size > 25 * 1024 * 1024) throw Error('Выбери файл до 25 МБ');
        const ref = { id: randomUUID(), name: path.basename(src), size: stat.size };
        copied.push(ref);
        await fs.copyFile(src, this.file(ref.id));
        await fs.chmod(this.file(ref.id), 0o600);
        if ((await fs.stat(this.file(ref.id))).size !== ref.size)
          throw Error('Файл изменился при копировании');
      }
      if (this.note(id) !== n) throw Error('Заметка изменилась');
      const original = n.attachments || [];
      n.attachments = [...original, ...copied];
      try {
        this.changed();
      } catch (e) {
        n.attachments = original;
        throw e;
      }
    } catch (e) {
      await this.discard(copied);
      throw e;
    }
  }
  get(id, fileId) {
    const a = this.note(id).attachments?.find((a) => a.id === fileId);
    if (!a) throw Error('Вложение удалено');
    return { name: a.name, path: this.file(a.id) };
  }
  async detach(id, fileId) {
    const n = this.note(id);
    this.get(id, fileId);
    const old = n.attachments;
    n.attachments = old.filter((a) => a.id !== fileId);
    try {
      this.changed();
    } catch (e) {
      n.attachments = old;
      throw e;
    }
    await this.discard([{ id: fileId }]);
  }
  async discard(files) {
    await Promise.all((files || []).map((a) => fs.rm(this.file(a.id), { force: true })));
  }
}
module.exports = { NoteFiles };
