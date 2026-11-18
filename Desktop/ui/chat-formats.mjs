export const imageTypes = ['png', 'jpeg', 'jpg', 'webp', 'gif'];
export const books = ['xlsx', 'xls', 'ods'];
export const documents = ['pdf', 'docx', ...books];
export const textTypes =
  'txt md markdown csv tsv json jsonl xml html htm yaml yml toml ini log rs ts tsx js jsx mjs cjs py rb go java kt swift c h cc cpp hpp cs php lua sh bash zsh ps1 bat sql graphql proto diff patch'.split(
    ' ',
  );
export const extensions = [...imageTypes, ...documents, ...textTypes];
export function extension(name) {
  return String(name).split('.').at(-1).toLowerCase();
}
export function fileKind(name, size) {
  const ext = extension(name);
  if (!extensions.includes(ext)) throw Error('Формат файла не поддерживается: ' + name);
  if (imageTypes.includes(ext)) {
    if (size > 16 * 1024 ** 2) throw Error('Выбери изображение меньше 16 МБ');
    return 'picture';
  }
  if (documents.includes(ext)) {
    if (size > 20 * 1024 ** 2) throw Error('Выбери документ меньше 20 МБ');
    return ext;
  }
  if (size > 150000) throw Error('Выбери текстовый файл меньше 150 КБ');
  return 'text';
}
