const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);
const fs = require('node:fs/promises');
const path = require('node:path');
async function branches(root, op = 'list', name = '') {
  if (!root) throw Error('Выбери рабочую папку проекта');
  const cwd = await fs.realpath(root);
  async function git(...args) {
    try {
      return (
        await run(
          'git',
          ['-c', 'core.hooksPath=' + require('node:os').devNull, '-c', 'core.fsmonitor=false', ...args],
          {
            cwd,
            windowsHide: true,
            timeout: 20000,
            maxBuffer: 2097152,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
          },
        )
      ).stdout.trimEnd();
    } catch (e) {
      throw Error(
        e.code === 'ENOENT'
          ? 'Установи Git и перезапусти Миру'
          : String(e.stderr || e.message)
              .trim()
              .slice(0, 700),
      );
    }
  }
  if (path.relative(cwd, await fs.realpath(await git('rev-parse', '--show-toplevel'))))
    throw Error('Выбери корневую папку репозитория Git');
  const status = await git('status', '--porcelain=v1', '--untracked-files=normal');
  if (op !== 'list') {
    if (
      !['create', 'switch'].includes(op) ||
      typeof name !== 'string' ||
      !name ||
      name.startsWith('-') ||
      name.includes('@{') ||
      name.length > 180
    )
      throw Error('Проверь имя ветки');
    await git('check-ref-format', 'refs/heads/' + name);
    if (status) throw Error('В проекте есть несохранённые в Git изменения');
    if (op === 'create') await git('switch', '--no-guess', '-c', name);
    else {
      await git('show-ref', '--verify', 'refs/heads/' + name);
      await git('switch', '--no-guess', name);
    }
  }
  return {
    current: await git('branch', '--show-current'),
    dirty: !!status,
    branches: (await git('for-each-ref', '--format=%(refname:short)', 'refs/heads'))
      .split('\n')
      .filter(Boolean),
  };
}
module.exports = { branches };
