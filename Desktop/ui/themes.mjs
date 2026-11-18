export const themeList = [
  ['cream', 'Кремовая'],
  ['paper', 'Бумага'],
  ['mist', 'Дымка'],
  ['sage', 'Шалфей'],
  ['rose', 'Сакура'],
  ['lavender', 'Лаванда'],
  ['ocean', 'Океан'],
  ['graphite', 'Графит'],
  ['coal', 'Уголь'],
  ['night', 'Ночная'],
  ['system', 'Как в системе'],
  ['custom', 'Своя'],
];
export const themeIds = themeList.map(([id]) => id);
const colors = { ocean: '#193447', lavender: '#e9e3f1' };
export const defaultCustomColor = '#e7daca';
export function applyPalette(body, theme, customColor) {
  const color = theme === 'custom' ? customColor || defaultCustomColor : colors[theme];
  body.dataset.theme = theme;
  if (!color || !/^#[a-f0-9]{6}$/i.test(color)) {
    delete body.dataset.paletteTone;
    body.style.removeProperty('--chosen-background');
    return;
  }
  const linear = (i) => {
    const n = parseInt(color.slice(i, i + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
  body.dataset.paletteTone = luminance < 0.179 ? 'dark' : 'light';
  body.style.setProperty('--chosen-background', color);
}
