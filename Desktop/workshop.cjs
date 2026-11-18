const { manifest } = require('./extensions.cjs');
const { createHash } = require('node:crypto');
function repository(input) {
  const s = String(input || '')
    .trim()
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
  if (!/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(s) || s.split('/').some((p) => p === '.' || p === '..'))
    throw Error('Укажи репозиторий в виде автор/название');
  return s;
}
const idFor = (r, id) =>
  createHash('sha256')
    .update(r.toLowerCase() + '#' + id)
    .digest('hex')
    .slice(0, 24);
class Workshop {
  constructor(repo, token, request = fetch) {
    this.repo = repository(repo);
    this.token = token;
    this.request = request;
  }
  async api(suffix, method = 'GET', data) {
    const r = await this.request(
      'https://api.github.com/repos/' + this.repo + '/contents/mira-workshop' + suffix,
      {
        method,
        signal: AbortSignal.timeout(25000),
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
          ...(data ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      },
    );
    if (r.status === 404 && suffix === '' && method === 'GET') {
      const repo = await this.request('https://api.github.com/repos/' + this.repo, {
        headers: this.token ? { Authorization: 'Bearer ' + this.token } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (repo.ok) return [];
      throw Error('Репозиторий недоступен. Проверь название и права доступа.');
    }
    if (!r.ok)
      throw Error(
        r.status === 409 || r.status === 422
          ? 'Работа изменилась. Обнови каталог перед сохранением.'
          : r.status === 401 || r.status === 403
            ? 'Проверь права токена GitHub на этот репозиторий.'
            : 'Каталог GitHub недоступен (' + r.status + ')',
      );
    return r.json();
  }
  async list() {
    const rows = await this.api('');
    if (!Array.isArray(rows)) throw Error('Нужна папка mira-workshop');
    return rows
      .filter(
        (f) => f.type === 'file' && f.size > 0 && f.size <= 512000 && /^[\w%-]{1,190}\.json$/.test(f.name),
      )
      .map((f) => ({ key: f.name, sha: f.sha, name: decodeTitle(f.name) }));
  }
  async read(key) {
    if (!/^[\w%-]{1,190}\.json$/.test(key)) throw Error('Неизвестная работа');
    const v = await this.api('/' + encodeURIComponent(key));
    if (v.size > 512000 || v.encoding !== 'base64') throw Error('Неподходящий файл');
    const json = JSON.parse(Buffer.from(v.content, 'base64').toString('utf8'));
    return { ...manifest(json), id: 'github-' + idFor(this.repo, key), sha: v.sha };
  }
  async publish(work, previous) {
    if (!this.token) throw Error('Для публикации сохрани токен с правом записи в репозиторий');
    const { id, name, detail, routines, contributions } = manifest(work);
    const title = Array.from(name)
      .slice(0, 16)
      .join('')
      .replace(/[^\p{L}\p{N}_-]+/gu, '-');
    const key =
      previous?.key || encodeURIComponent(title || 'pack') + '--' + idFor(this.repo, id) + '.json';
    const file = Buffer.from(JSON.stringify({ name, detail, routines, contributions }, null, 2));
    if (file.length > 512000) throw Error('Набор больше 500 КБ');
    const result = await this.api('/' + encodeURIComponent(key), 'PUT', {
      message: 'Мастерская Миры · ' + name,
      content: file.toString('base64'),
      ...(previous ? { sha: previous.sha } : {}),
    });
    return { key, sha: result.content.sha };
  }
  async remove(work) {
    if (!this.token) throw Error('Для удаления нужен токен');
    await this.api('/' + encodeURIComponent(work.key), 'DELETE', {
      message: 'Снять работу с публикации',
      sha: work.sha,
    });
  }
}
function decodeTitle(key) {
  try {
    return decodeURIComponent(key.replace(/--[\da-f]{24}\.json$/, '').replace(/\.json$/, '')).replaceAll(
      '-',
      ' ',
    );
  } catch {
    return key;
  }
}
module.exports = { Workshop, repository };
