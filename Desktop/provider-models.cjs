async function discover(base, key, fetchModels = fetch) {
  const claude = new URL(base).hostname === 'api.anthropic.com';
  const headers = { Accept: 'application/json' };
  if (claude) {
    headers['anthropic-version'] = '2023-06-01';
    if (key) headers['x-api-key'] = key;
  } else if (key) headers.Authorization = 'Bearer ' + key;

  const ids = new Set();
  let cursor;
  let pages = 0;
  do {
    const url = new URL(base + '/models');
    if (cursor) url.searchParams.set('after_id', cursor);
    const response = await fetchModels(url, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Не удалось получить список моделей (HTTP ' + response.status + ')');
    const result = await response.json();
    if (!Array.isArray(result.data)) throw Error('Сервис вернул неизвестный формат списка моделей');
    for (const model of result.data) {
      if (typeof model?.id === 'string' && model.id && model.id.length <= 200) ids.add(model.id);
    }
    if (!claude || !result.has_more || !result.last_id || cursor === result.last_id) break;
    cursor = result.last_id;
  } while (++pages < 10 && ids.size < 2000);
  return Array.from(ids).sort();
}
module.exports = { discover };
