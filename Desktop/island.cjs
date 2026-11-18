const path = require('node:path'),
  fs = require('node:fs/promises'),
  { randomUUID } = require('node:crypto');
const { BrowserWindow, screen, clipboard, dialog, shell } = require('electron');
class Island {
  constructor(store, prefs, guard, main, changed, voice) {
    Object.assign(this, { store, prefs, guard, main, changed, voice });
    this.history = [];
    this.last = '';
  }
  configure() {
    const s = this.store.data.settings;
    if (!s.island) {
      this.win?.close();
      this.stop();
      return;
    }
    if (!this.win) {
      this.expanded = false;
      this.win = new BrowserWindow({
        width: 236,
        height: 46,
        transparent: true,
        frame: false,
        skipTaskbar: true,
        resizable: false,
        show: false,
        hasShadow: false,
        webPreferences: this.prefs,
      });
      this.guard(this.win);
      this.win.once('closed', () => {
        this.win = null;
        this.stop();
      });
      this.resize(false);
      this.win.loadURL('mira://desk/island.html');
      this.win.once('ready-to-show', () => this.win?.showInactive());
    }
    this.win.setAlwaysOnTop(s.islandPin !== false, 'floating');
    this.win.setContentProtection(!!s.hideCapture);
    if (s.clipMemory && !this.timer) {
      this.timer = setInterval(() => this.sample().catch(() => {}), 900);
      const timer = this.timer;
      this.ready = clipboard
        .readText()
        .then((t) => {
          if (this.timer === timer) this.last = t;
        })
        .catch(() => {});
    }
    if (!s.clipMemory) this.stop();
    this.notify();
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.history = [];
    this.last = '';
  }
  notify() {
    this.win?.webContents.send('update', { type: 'island' });
  }
  async sample() {
    if (this.reading) return;
    this.reading = true;
    const timer = this.timer;
    try {
      await this.ready;
      const items = await clipboard.read();
      if (
        timer !== this.timer ||
        !timer ||
        items.some((i) =>
          i.types.some((f) =>
            /ExcludeClipboardContentFromMonitorProcessing|CanIncludeInClipboardHistory|concealed|transient/i.test(
              f,
            ),
          ),
        )
      )
        return;
      const item = items.find((x) => x.types.includes('text/plain'));
      if (!item) return;
      const value = await item.getType('text/plain');
      const text = typeof value === 'string' ? value : await value.text();
      if (timer !== this.timer || text === this.last) return;
      this.last = text;
      if (!text.trim() || text.length > 32000) return;
      this.history = [{ id: randomUUID(), text }, ...this.history.filter((v) => v.text !== text)].slice(
        0,
        20,
      );
      this.notify();
    } finally {
      this.reading = false;
    }
  }
  resize(expanded) {
    if (!this.win) return;
    this.expanded = expanded;
    const a = screen.getDisplayMatching(this.main.getBounds()).workArea;
    const width = Math.min(a.width, expanded ? 440 : 236),
      height = Math.min(a.height, expanded ? 394 : 46);
    this.win.setBounds({ x: Math.round(a.x + (a.width - width) / 2), y: a.y + 6, width, height });
  }
  async shelf(paths) {
    const valid = [];
    for (const p of paths.slice(0, 32))
      if (typeof p === 'string' && path.isAbsolute(p) && (await fs.stat(p).catch(() => null))?.isFile())
        valid.push(p);
    const rows = this.store.data.shelf || [];
    for (const p of valid)
      if (!rows.some((r) => r.path === p)) rows.push({ id: randomUUID(), name: path.basename(p), path: p });
    this.store.data.shelf = rows.slice(-80);
    this.changed();
  }
  async action({ op, id, paths, text }) {
    const d = this.store.data;
    switch (op) {
      case 'state': {
        const chats = [...d.chats].sort(
          (a, b) => (b.messages.at(-1)?.time || b.created) - (a.messages.at(-1)?.time || a.created),
        );
        return {
          name: d.settings.name,
          theme: d.settings.theme,
          expanded: this.expanded,
          voice: this.voice(),
          notes: d.notes.slice(0, 4),
          tasks: d.tasks.filter((r) => !r.done).slice(0, 4),
          focus: d.focus,
          history: this.history,
          record: d.settings.clipMemory,
          shelf: (d.shelf || []).map(({ id, name }) => ({ id, name })),
          chatId: chats[0]?.id,
          chats: chats.slice(0, 20).map((c) => ({ id: c.id, title: c.title })),
          last:
            chats[0]?.messages.slice(-6).map((r) => ({ role: r.role, text: r.text.slice(0, 1000) })) || [],
        };
      }
      case 'size':
        this.resize(!!id);
        return;
      case 'drop':
        return this.shelf(Array.isArray(paths) ? paths : []);
      case 'pick': {
        const r = await dialog.showOpenDialog(this.win, { properties: ['openFile', 'multiSelections'] });
        if (!r.canceled) await this.shelf(r.filePaths);
        return;
      }
      case 'open': {
        const r = (d.shelf || []).find((r) => r.id === id);
        if (r) {
          const error = await shell.openPath(r.path);
          if (error) throw Error(error);
        }
        return;
      }
      case 'remove':
        d.shelf = (d.shelf || []).filter((r) => r.id !== id);
        this.changed();
        return;
      case 'copy': {
        const r = this.history.find((r) => r.id === id);
        if (r) await clipboard.writeText(r.text);
        return;
      }
      case 'clear':
        this.history = [];
        this.notify();
        return;
      case 'record':
        d.settings.clipMemory = !d.settings.clipMemory;
        this.configure();
        await this.ready;
        this.changed();
        return;
      case 'voice':
        this.main.webContents.send('update', { type: 'toggleVoice' });
        return;
      case 'chat':
        this.main.show();
        this.main.focus();
        this.main.webContents.send('update', {
          type: 'islandChat',
          id,
          text: String(text || '').slice(0, 12000),
        });
        return;
      default:
        throw Error('Неизвестное действие');
    }
  }
}
module.exports = { Island };
