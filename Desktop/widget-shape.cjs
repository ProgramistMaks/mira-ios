// Normalized widget polygon. Scan each row at its pixel centre; concave shapes may yield several runs.
function polygon(text) {
  if (!text?.trim()) return [];
  const pairs = text.trim().split(/\s+/);
  if (pairs.length < 3 || pairs.length > 48) throw Error('Задай от 3 до 48 точек контура');
  const points = pairs.map((p) => {
    if (!/^\d{1,3},\d{1,3}$/.test(p)) throw Error('Формат точки: x,y от 0 до 100');
    const pair = p.split(',').map(Number);
    if (pair.some((n) => n > 100)) throw Error('Координаты должны быть от 0 до 100');
    return pair;
  });
  if (!region(points, 100, 100).length) throw Error('У контура нет площади');
  return points;
}
function region(points, width, height) {
  if (!points.length) return [];
  const result = [],
    last = new Map(),
    pix = points.map(([x, y]) => [(x * width) / 100, (y * height) / 100]);
  for (let y = 0; y < height; y++) {
    const cuts = [],
      center = y + 0.5;
    for (let i = 0; i < pix.length; i++) {
      const [ax, ay] = pix[i],
        [bx, by] = pix[(i + 1) % pix.length];
      if (ay > center !== by > center) cuts.push(ax + ((center - ay) * (bx - ax)) / (by - ay));
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const x = Math.max(0, Math.ceil(cuts[i] - 0.5)),
        end = Math.min(width, Math.ceil(cuts[i + 1] - 0.5));
      if (end <= x) continue;
      const key = x + ',' + end,
        prev = last.get(key);
      if (prev && prev.y + prev.height === y) {
        prev.height++;
        continue;
      }
      const run = { x, y, width: end - x, height: 1 };
      last.set(key, run);
      result.push(run);
    }
  }
  return result;
}
module.exports = { polygon, region };
