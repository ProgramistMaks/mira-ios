const { execFile } = require('node:child_process'),
  { promisify } = require('node:util'),
  path = require('node:path');
const run = promisify(execFile);
const validName = (s) => typeof s === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}_. -]{0,95}$/u.test(s);
async function processRunning(name, signal) {
  if (!validName(name)) throw Error('Укажи имя процесса, например notepad.exe');
  const norm = (s) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\.exe$/i, '');
  if (process.platform === 'win32') {
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tasklist.exe');
    const { stdout } = await run(
      exe,
      [
        '/FO',
        'CSV',
        '/NH',
        '/FI',
        'IMAGENAME eq ' + (name.toLowerCase().endsWith('.exe') ? name : name + '.exe'),
      ],
      { windowsHide: true, signal, timeout: 8000 },
    );
    return stdout.split(/\r?\n/).some((line) => norm(/^"([^"]+)"/.exec(line)?.[1] || '') === norm(name));
  }
  const { stdout } = await run('ps', ['-A', '-o', 'comm='], { signal, timeout: 8000 });
  return stdout.split('\n').some((line) => norm(path.basename(line)) === norm(name));
}
module.exports = { validName, processRunning };
