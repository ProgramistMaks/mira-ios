const { sortedNotes, taskListOf } = require('./ui/note-format.mjs');
const { BrowserWindow, screen } = require('electron');
const path = require('node:path');
const run = require('node:util').promisify(require('node:child_process').execFile);
const fs = require('node:fs/promises');
let helper;
async function wallpaperHelper() {
  const bundled = path.join(__dirname, 'windows', 'MiraWallpaper.exe');
  try {
    await fs.access(bundled);
    return bundled;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!helper)
    helper = compileHelper().catch((error) => {
      helper = null;
      throw error;
    });
  return helper;
}
async function compileHelper() {
  // Linux-built portable packages ship the same C# source. Windows includes the .NET Framework compiler.
  const dir = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'mira-wallpaper-'));
  const exe = path.join(dir, 'MiraWallpaper.exe');
  try {
    await run(
      path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
      [
        '/nologo',
        '/target:winexe',
        '/platform:x64',
        '/optimize+',
        '/out:' + exe,
        path.join(__dirname, 'windows', 'MiraWallpaper.cs'),
      ],
      { windowsHide: true, timeout: 20000 },
    );
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
  require('electron').app.once('will-quit', () => {
    try {
      require('node:fs').rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return exe;
}
const { polygon, region } = require('./widget-shape.cjs');
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
      if (w && w.wallpaper !== !!opt.wallpaper) {
        w.destroy();
        w = null;
      }
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
        w.wallpaper = !!opt.wallpaper;
        this.windows.set(id, w);
        w.on('resize', () => this.applyShape(w, this.store.data.screenWidgets?.[id]?.shape));
        this.guard(w);
        w.on('moved', () => {
          const entry = this.store.data.screenWidgets?.[id];
          if (entry && !w.wallpaper && !w.isDestroyed()) {
            [entry.x, entry.y] = w.getPosition();
            this.store.save();
          }
        });
        w.on('closed', () => {
          if (this.windows.get(id) === w) this.windows.delete(id);
        });
        w.once('ready-to-show', () => {
          w.showInactive();
          if (!w.wallpaper) return;
          const native = w.getNativeWindowHandle();
          const handle = (native.length === 8 ? native.readBigUInt64LE() : native.readUInt32LE()).toString();
          const isCurrent = () => this.windows.get(id) === w && !w.isDestroyed();
          wallpaperHelper()
            .then(async (exe) => {
              if (!isCurrent()) return;
              await run(exe, [handle], { windowsHide: true, timeout: 10000 });
              if (isCurrent()) w.wallpaperAttached = true;
            })
            .catch(() => {
              if (!isCurrent()) return;
              this.set(id, 'window');
              this.main.webContents.send('update', {
                type: 'notice',
                message: 'Слой обоев Windows недоступен. Виджет открыт в обычном окне.',
              });
            });
        });
        w.loadURL('mira://desk/widget.html');
      }
      this.applyShape(w, opt.shape);
      if (!w.wallpaper) w.setAlwaysOnTop(!!opt.pin, 'floating');
      w.setContentProtection(!!this.store.data.settings.hideCapture);
    }
    this.notify();
  }
  notify() {
    for (const w of this.windows.values())
      if (!w.isDestroyed()) w.webContents.send('update', { type: 'widget' });
  }
  applyShape(w, text = '') {
    if (w.isDestroyed() || !['win32', 'linux'].includes(process.platform)) return;
    const [width, height] = w.getSize(),
      key = [text, width, height].join('/');
    if (w.shapeKey === key) return;
    w.setShape(region(polygon(text), width, height));
    w.shapeKey = key;
  }
  set(id, mode, shape) {
    if (!modes.has(id) || !['off', 'window', 'pin', 'wallpaper'].includes(mode))
      throw Error('Неизвестный виджет');
    if (mode === 'wallpaper' && process.platform !== 'win32') throw Error('Слой обоев доступен в Windows');
    if (shape !== undefined) polygon(shape);
    const rows = (this.store.data.screenWidgets ??= {});
    if (mode === 'off') delete rows[id];
    else
      rows[id] = {
        ...rows[id],
        pin: mode === 'pin',
        wallpaper: mode === 'wallpaper',
        shape: shape ?? rows[id]?.shape ?? '',
      };
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
        reduced: d.settings.reduced,
        customColor: d.settings.customColor,
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
