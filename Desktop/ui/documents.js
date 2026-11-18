import { books, fileKind } from './chat-formats.mjs';
const maxText = 35000;
async function pdf(bytes) {
  const { getDocument, GlobalWorkerOptions } = await import('./vendor/pdf.min.mjs');
  GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  const task = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href,
  });
  let result = '';
  try {
    const doc = await task.promise;
    for (let i = 1; i <= Math.min(doc.numPages, 180) && result.length < maxText; i++) {
      const page = await doc.getPage(i),
        content = await page.getTextContent();
      result += content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join('') + '\n';
      page.cleanup();
    }
    if (!result.trim()) throw Error('В PDF нет текстового слоя. Выбери документ с распознанным текстом.');
    return result;
  } finally {
    await task.destroy();
  }
}
async function docx(bytes) {
  const { unzipSync, strFromU8 } = await import('./vendor/fflate.js');
  const part = unzipSync(bytes, {
    filter: (e) => e.name === 'word/document.xml' && e.originalSize <= 8 * 1024 * 1024,
  })['word/document.xml'];
  if (!part) throw Error('Документ Word повреждён или слишком велик');
  const xml = new DOMParser().parseFromString(strFromU8(part), 'application/xml');
  if (xml.querySelector('parsererror')) throw Error('Не удалось прочитать документ Word');
  let out = '';
  for (const p of xml.getElementsByTagNameNS('*', 'p')) {
    out += Array.from(p.getElementsByTagNameNS('*', 't'), (t) => t.textContent).join('') + '\n';
    if (out.length >= maxText) break;
  }
  return out;
}
export async function readAttachment(item) {
  if (!item.bytes) return item;
  const bytes = new Uint8Array(item.bytes);
  if (item.kind === 'picture') return picture(item.name, bytes);
  const body =
    item.kind === 'text'
      ? new TextDecoder().decode(bytes)
      : books.includes(item.kind)
        ? await sheetText(bytes)
        : item.kind === 'pdf'
          ? await pdf(bytes)
          : await docx(bytes);
  const text = body.trim().slice(0, maxText);
  if (!text) throw Error('В документе нет текста');
  return { name: item.name, text };
}
async function sheetText(bytes) {
  const worker = new Worker('/sheet-worker.mjs', { type: 'module' });
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Таблица слишком сложна для чтения')), 15000);
      worker.onmessage = (e) => {
        clearTimeout(timeout);
        e.data.error ? reject(Error(e.data.error)) : resolve(e.data.text);
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        reject(Error('Не удалось открыть таблицу'));
      };
      worker.postMessage(bytes.buffer, [bytes.buffer]);
    });
  } finally {
    worker.terminate();
  }
}
async function picture(name, bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { kind: 'image', name, data: canvas.toDataURL('image/jpeg', 0.85) };
  } finally {
    bitmap.close();
  }
}
export async function readDropped(file) {
  const name = file.name || 'Вставленное изображение.png',
    kind = fileKind(name, file.size);
  return readAttachment({ name, kind, bytes: new Uint8Array(await file.arrayBuffer()) });
}
