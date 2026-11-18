const path = require('node:path'),
  { spawn } = require('node:child_process');
const catalog = {
  explorer: ['Проводник', 'explorer.exe'],
  notepad: ['Блокнот', 'notepad.exe'],
  calculator: ['Калькулятор', 'calc.exe'],
  tasks: ['Диспетчер задач', 'Taskmgr.exe'],
  settings: ['Параметры Windows', 'ms-settings:'],
  display: ['Параметры экрана', 'ms-settings:display'],
  sound: ['Параметры звука', 'ms-settings:sound'],
  volume: ['Микшер громкости', 'ms-settings:apps-volume'],
  night: ['Ночной свет', 'ms-settings:nightlight'],
  wifi: ['Параметры сети', 'ms-settings:network-status'],
  bluetooth: ['Параметры Bluetooth', 'ms-settings:bluetooth'],
  updates: ['Центр обновлений', 'ms-settings:windowsupdate'],
  startup: ['Автозагрузка', 'ms-settings:startupapps'],
  downloads: ['Загрузки', 'downloads'],
  docs: ['Документы', 'documents'],
  pictures: ['Изображения', 'pictures'],
  music: ['Музыка', 'music'],
  videos: ['Видео', 'videos'],
};
const windowsOnly = (id) => /\.exe$|^ms-settings:/.test(catalog[id]?.[1] || '');
async function launch(id, app, shell) {
  if (!Object.hasOwn(catalog, id)) throw Error('Ярлык не найден');
  const target = catalog[id][1];
  if (windowsOnly(id) && process.platform !== 'win32') throw Error('Доступно в Windows');
  if (target.startsWith('ms-settings:')) return shell.openExternal(target);
  if (target.endsWith('.exe'))
    return new Promise((resolve, reject) => {
      const c = spawn(
        path.join(
          process.env.SystemRoot || 'C:\\Windows',
          ...(id === 'explorer' ? [] : ['System32']),
          target,
        ),
        [],
        {
          detached: true,
          stdio: 'ignore',
        },
      );
      c.once('spawn', () => {
        c.unref();
        resolve();
      });
      c.once('error', reject);
    });
  const error = await shell.openPath(app.getPath(target));
  if (error) throw Error(error);
}
module.exports = { catalog, windowsOnly, launch };
