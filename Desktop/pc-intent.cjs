const fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const targets = new Map([
  ['калькулятор', 'calculator'],
  ['calculator', 'calculator'],
  ['блокнот', 'notepad'],
  ['notepad', 'notepad'],
  ['настройки', 'settings'],
  ['настройки windows', 'settings'],
  ['settings', 'settings'],
  ['диспетчер задач', 'tasks'],
  ['task manager', 'tasks'],
  ['папку загрузок', 'downloads'],
  ['загрузки', 'downloads'],
  ['downloads', 'downloads'],
  ['документы', 'docs'],
  ['documents', 'docs'],
  ['проводник', 'explorer'],
  ['file explorer', 'explorer'],
]);
function desktopIntent(text, spoken = false) {
  const phrase = text
    .trim()
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .replace(/(браузер)[-–—]+(?=[а-яa-z])/g, '$1 ')
    .replace(/^(?:(?:мира|пожалуйста|please)\s+)+|\s+(?:пожалуйста|please)$/g, '');
  // Allow one misheard vowel or final sound only for the complete spoken Google browser command.
  if (spoken && /^откр[оуа](?:й|ю) браузер (?:гугл|гугол|бугл|google)$/.test(phrase)) return 'browser';
  const match = /^(?:открой(?:те)?|открывай(?:те)?|открыть|запусти(?:те)?|запускай(?:те)?|запустить|open|launch)\s+(?:(?:the|мой)\s+)?(.+)$/.exec(phrase);
  if (!match) return;
  if (/^(?:браузер\s+)?(?:(?:гугл|гугол|google)\s+)?(?:хром|chrome)(?:\s+browser)?$/.test(match[1]))
    return 'chrome';
  if (
    /^(?:браузер|браузер (?:гугл|гугол|бугл|google)|(?:гугл|гугол|google) браузер|гугл|гугол|google|browser|google browser)$/.test(
      match[1],
    )
  )
    return 'browser';
  return targets.get(match[1]);
}
async function openBrowser(intent, shell) {
  const home = 'https://www.google.com/';
  if (intent === 'browser') return shell.openExternal(home);
  const exe =
    process.platform === 'win32'
      ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
          .filter(Boolean)
          .map((p) => path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe'))
          .find((p) => fs.existsSync(p))
      : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) =>
          fs.existsSync(p),
        );
  if (!exe) throw Error('Google Chrome не установлен');
  await new Promise((resolve, reject) => {
    const child = spawn(exe, [home], { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
module.exports = { desktopIntent, openBrowser };
