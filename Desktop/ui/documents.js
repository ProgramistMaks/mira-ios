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
  const bytes = new Uint8Array(item.bytes),
    body = item.kind === 'pdf' ? await pdf(bytes) : await docx(bytes);
  const text = body.trim().slice(0, maxText);
  if (!text) throw Error('В документе нет текста');
  return { name: item.name, text };
}
