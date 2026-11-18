import { read, utils, set_cptable } from './vendor/xlsx.mjs';
import * as codepages from './vendor/cpexcel.full.mjs';
import { unzipSync } from './vendor/fflate.js';
set_cptable(codepages);
self.onmessage = ({ data }) => {
  try {
    const bytes = new Uint8Array(data);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      let expanded = 0,
        count = 0;
      unzipSync(bytes, {
        filter(entry) {
          expanded += entry.originalSize;
          if (++count > 12000 || expanded > 64 * 1024 * 1024)
            throw Error('Распакованная таблица слишком велика');
          return false;
        },
      });
    }
    const wb = read(bytes, {
      type: 'array',
      sheetRows: 1000,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
    });
    const lines = [];
    let length = 0,
      truncated = false;
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet?.['!ref']) continue;
      const r = utils.decode_range(sheet['!ref']),
        full = utils.decode_range(sheet['!fullref'] || sheet['!ref']);
      truncated ||= full.e.r > r.e.r || r.e.c - r.s.c >= 128;
      lines.push('Лист «' + name + '»');
      for (let row = r.s.r; row <= Math.min(r.e.r, r.s.r + 999); row++) {
        const cells = [];
        for (let col = r.s.c; col <= Math.min(r.e.c, r.s.c + 127); col++) {
          const cell = sheet[utils.encode_cell({ r: row, c: col })];
          cells.push(
            cell
              ? String(cell.w ?? utils.format_cell(cell))
                  .replace(/[\t\r\n]+/g, ' ')
                  .slice(0, 35000)
              : '',
          );
        }
        while (cells.length && !cells.at(-1)) cells.pop();
        if (!cells.length) continue;
        const line = cells.join('\t');
        lines.push(line);
        length += line.length + 1;
        if (length >= 34500) {
          truncated = true;
          break;
        }
      }
      if (length >= 34500) break;
    }
    if (!length) throw Error('В таблице нет заполненных ячеек');
    self.postMessage({
      text: lines.join('\n').slice(0, 34750) + (truncated ? '\n[Показана часть таблицы]' : ''),
    });
  } catch (e) {
    self.postMessage({ error: e.message || 'Не удалось прочитать таблицу' });
  }
};
