const allowed = new Set(['b', 'i', 'u', 's', 'code', 'h2', 'p', 'div', 'blockquote', 'ul', 'ol', 'li', 'br']);
const aliases = { strong: 'b', em: 'i', strike: 's', h1: 'h2', h3: 'h2' };
export function noteTag(name) {
  const tag = Object.hasOwn(aliases, name) ? aliases[name] : name;
  return allowed.has(tag) ? tag : '';
}
export function noteDocument(input) {
  let count = 0,
    length = 0;
  function visit(node, depth) {
    if (++count > 5000 || depth > 32) throw Error('Слишком сложное форматирование заметки');
    if (typeof node === 'string') {
      length += node.length;
      if (length > 10000) throw Error('В заметке можно сохранить до 10 000 символов');
      return node;
    }
    const tag = noteTag(node?.tag);
    if (!tag || !Array.isArray(node.children)) throw Error('Неизвестный формат заметки');
    return { tag, children: tag === 'br' ? [] : node.children.map((v) => visit(v, depth + 1)) };
  }
  if (!Array.isArray(input)) throw Error('Неизвестный формат заметки');
  return input.map((node) => visit(node, 0));
}
export function noteText(nodes) {
  let text = '';
  function visit(n) {
    if (typeof n === 'string') {
      text += n;
      return;
    }
    if (n.tag === 'br') {
      text += '\n';
      return;
    }
    const block = ['p', 'div', 'h2', 'li', 'blockquote', 'ul', 'ol'].includes(n.tag);
    if (block && text && !text.endsWith('\n')) text += '\n';
    n.children.forEach(visit);
    if (block && !text.endsWith('\n')) text += '\n';
  }
  nodes.forEach(visit);
  return text.trim();
}
export const noteLabel = (n) => n.title?.trim() || n.text?.trim().split('\n')[0] || 'Пустая заметка…';
export const sortedNotes = (notes) => [...notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
export const taskListOf = (task) => task.list || 'main';
