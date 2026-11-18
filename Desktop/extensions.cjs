const { themeIds } = require('./ui/themes.mjs');
const { routine, endpoint, uid } = require('./core.cjs');
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
function contributions(input = {}, count = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Неверный формат расширения');
  const result = {};
  if (input.panel) {
    const p = input.panel,
      links = p.commands ?? [];
    if (
      !Array.isArray(links) ||
      links.length > 30 ||
      links.some((n) => !Number.isInteger(n) || n < 0 || n >= count)
    )
      throw Error('В панели указана неизвестная команда');
    result.panel = {
      name: text(p.name, 80) || 'Панель',
      body: text(p.body, 2200),
      commands: [...new Set(links)],
    };
  }
  if (input.theme) {
    const t = input.theme;
    if (!themeIds.includes(t.theme) || t.theme === 'system' || !/^#[\da-f]{6}$/i.test(t.accent))
      throw Error('Проверь основу и цвет темы');
    result.theme = { theme: t.theme, accent: t.accent, glass: t.glass === true };
    if (t.theme === 'custom' && t.customColor !== undefined) {
      if (!/^#[a-f0-9]{6}$/i.test(t.customColor)) throw Error('Проверь цвет фона темы');
      result.theme.customColor = t.customColor;
    }
  }
  if (input.ai) {
    if (!text(input.ai.model, 160)) throw Error('Укажи модель ИИ в наборе');
    result.ai = { base: endpoint(input.ai.base), model: text(input.ai.model, 160) };
  }
  if (input.speech) {
    const v = input.speech,
      ttsModel = text(v.ttsModel, 160),
      sttModel = text(v.sttModel, 160);
    if (!ttsModel && !sttModel) throw Error('Укажи модель для синтеза или распознавания');
    result.speech = { base: endpoint(v.base), ttsModel, sttModel, voice: text(v.voice, 120) };
  }
  for (const key of ['blocks', 'triggers']) {
    if (!input[key]) continue;
    if (!Array.isArray(input[key]) || input[key].length > 24)
      throw Error('Слишком много блоков или триггеров');
    const entries = input[key].map((v) => {
      if (!Number.isInteger(v?.command) || v.command < 0 || v.command >= count)
        throw Error('Расширение ссылается на отсутствующую команду');
      if (key === 'blocks') return { name: text(v.name, 80) || 'Блок набора', command: v.command };
      if (!['ready', 'focusEnd', 'reminder'].includes(v.event)) throw Error('Неизвестное событие');
      return { event: v.event, command: v.command };
    });
    if (entries.length) result[key] = entries;
  }
  if (input.tools) {
    if (!Array.isArray(input.tools) || input.tools.length > 12) throw Error('Допустимо до 12 серверов MCP');
    const tools = input.tools.map((v) => ({ name: text(v.name, 80) || 'MCP', url: endpoint(v.url) }));
    if (tools.length) result.tools = tools;
  }
  return result;
}
function manifest(input) {
  if (!input || typeof input !== 'object') throw Error('Нужен набор Миры');
  const rows = input.routines ?? [];
  if (!Array.isArray(rows) || rows.length > 30) throw Error('В наборе допустимо до 30 команд');
  const routines = rows.map(routine),
    caps = contributions(input.contributions, routines.length);
  if (!routines.length && !Object.keys(caps).length) throw Error('В наборе нет команд или расширений');
  return {
    id: text(input.id, 90) || uid(),
    name: text(input.name, 100) || 'Мой набор',
    detail: text(input.detail, 280),
    routines,
    contributions: caps,
  };
}
module.exports = { manifest };
