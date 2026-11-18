const { sortedNotes, taskListOf } = require('./ui/note-format.mjs');
const { BrowserWindow, screen } = require('electron');
const modes = new Set(['focus', 'tasks', 'notes', 'events']);
class ScreenWidgets {
  constructor(store, prefs, guard, main, changed, actions) {
    Object.assign(this, { store, prefs, guard, main, changed, actions });
    this.windows = new Map();
  }
  configure() {
    const rows = this.store.data.screenWidgets || {};
    for (const [id, w] of this.windows) if (!rows[id]) w.close();
    for (const [id, opt] of Object.entries(rows)) {
      if (!modes.has(id)) continue;
      let w = this.windows.get(id);
      if (!w) {
        const a = screen.getDisplayMatching(this.main.getBounds()).workArea;
        const x = Math.round(opt.x ?? a.x + a.width - 300),
          y = Math.round(opt.y ?? a.y + 60 + this.windows.size * 54);
        const area = screen.getDisplayNearestPoint({ x, y }).workArea;
        w = new BrowserWindow({
          width: 276,
          height: 202,
          minWidth: 230,
          minHeight: 150,
          show: false,
          frame: false,
          skipTaskbar: true,
          resizable: true,
          x: Math.max(area.x, Math.min(x, area.x + area.width - 276)),
          y: Math.max(area.y, Math.min(y, area.y + area.height - 202)),
          webPreferences: this.prefs,
        });
        this.windows.set(id, w);
        this.guard(w);
        w.on('moved', () => {
          const entry = this.store.data.screenWidgets?.[id];
          if (entry && !w.isDestroyed()) {
            [entry.x, entry.y] = w.getPosition();
            this.store.save();
          }
        });
        w.on('closed', () => {
          if (this.windows.get(id) === w) this.windows.delete(id);
        });
        w.once('ready-to-show', () => w.showInactive());
        w.loadURL('mira://desk/widget.html');
      }
      w.setAlwaysOnTop(!!opt.pin, 'floating');
      w.setContentProtection(!!this.store.data.settings.hideCapture);
    }
    this.notify();
  }
  notify() {
    for (const w of this.windows.values())
      if (!w.isDestroyed()) w.webContents.send('update', { type: 'widget' });
  }
  set(id, mode) {
    if (!modes.has(id) || !['off', 'window', 'pin'].includes(mode)) throw Error('Неизвестный виджет');
    const rows = (this.store.data.screenWidgets ??= {});
    if (mode === 'off') delete rows[id];
    else rows[id] = { ...rows[id], pin: mode === 'pin' };
    this.configure();
    this.changed();
  }
  identify(sender) {
    for (const [id, w] of this.windows) if (w.webContents === sender) return id;
  }
  action(id, { op, task }) {
    const d = this.store.data;
    if (op === 'state')
      return {
        id,
        theme: d.settings.theme,
        focus: id === 'focus' ? d.focus : null,
        items:
          id === 'focus'
            ? []
            : (id === 'notes' ? sortedNotes(d.notes) : d[id])
                .filter(
                  (x) =>
                    !x.done &&
                    !x.fired &&
                    (id !== 'events' || x.category !== 'reminder') &&
                    (id !== 'tasks' || taskListOf(x) === d.activeTaskList),
                )
                .slice(0, 12)
                .map(({ id, text, time }) => ({ id, text, time })),
        pinned: !!d.screenWidgets?.[id]?.pin,
      };
    if (op === 'open') {
      this.main.show();
      this.main.focus();
      this.main.webContents.send('update', { type: 'openWidget', id });
      return;
    }
    if (op === 'close') return this.set(id, 'off');
    if (op === 'pin') return this.set(id, d.screenWidgets[id].pin ? 'window' : 'pin');
    if (op === 'focus' && id === 'focus')
      return this.actions.focus({
        action: d.focus.ends ? 'pause' : d.focus.remaining > 0 ? 'resume' : 'start',
        minutes: 25,
      });
    if (op === 'done' && id === 'tasks' && d.tasks.some((t) => t.id === task))
      return this.actions.toggleTask({ id: task });
    throw Error('Действие недоступно');
  }
}
module.exports = { ScreenWidgets };
