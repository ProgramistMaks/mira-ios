export function address(text, name, waiting) {
  const phrase = String(text).trim(),
    tokens = phrase.match(/[\p{L}\p{N}]+/gu) || [];
  const normalized = tokens.join(' ').toLocaleLowerCase('ru');
  if (!waiting)
    return /^(?:жди обращения|перейди в режим ожидания)$/.test(normalized)
      ? { waiting: true, reply: 'Позови меня по имени.' }
      : { waiting: false, text: phrase };
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    '^(?:(?:привет|эй|слушай)[\\s,.!–—-]+)?' + escaped + '(?=$|[^\\p{L}\\p{N}])[\\s,.!?–—:-]*',
    'iu',
  ).exec(phrase);
  if (!match) return { waiting: true };
  const rest = phrase.slice(match[0].length).trim();
  return rest ? { waiting: false, text: rest } : { waiting: false, reply: 'Я слушаю.' };
}
