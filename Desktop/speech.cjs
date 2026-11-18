const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { spawn } = require('node:child_process');
const { fishSpeech } = require('./network.cjs');
function childRun(exe, args, input, signal, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd: opts.cwd || path.dirname(exe),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal,
      env: opts.env || process.env,
    });
    let out = '',
      err = '';
    const timeout = setTimeout(() => child.kill(), opts.timeout || 120000);
    child.stdout.on('data', (b) => {
      out = (out + b.toString()).slice(-800000);
    });
    child.stderr.on('data', (b) => {
      err = (err + b.toString()).slice(-1200);
    });
    child.once('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(out);
      else reject(Error(err.trim() || 'Голосовой движок остановился'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
}
const winPS = () =>
  path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
function ps(script, env = {}, signal) {
  return childRun(
    winPS(),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    null,
    signal,
    { cwd: os.tmpdir(), env: { ...process.env, ...env } },
  );
}
async function temp(fn) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-voice-'));
  try {
    return await fn(folder);
  } finally {
    await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}
async function transcribe(base, bytes, signal, wakeName) {
  const b = Buffer.from(bytes);
  if (
    b.length < 44 ||
    b.length > 32 * 1024 * 1024 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw Error('Некорректная запись микрофона');
  return temp(async (dir) => {
    const file = path.join(dir, 'speech.wav'),
      out = path.join(dir, 'text');
    await fs.writeFile(file, b);
    const exe = path.join(base, 'whisper', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
    await childRun(
      exe,
      [
        '-m',
        path.join(base, 'voices', 'ggml-base-q5_1.bin'),
        '-f',
        file,
        '-l',
        'ru',
        '-nt',
        ...(wakeName ? ['--prompt', String(wakeName).slice(0, 50) + '.'] : []),
        '-otxt',
        '-of',
        out,
        '-t',
        '4',
      ],
      null,
      signal,
    );
    return (await fs.readFile(out + '.txt', 'utf8')).replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
  });
}
async function speak(base, state, text, key, signal) {
  const s = state.settings;
  text = String(text).slice(0, 6000);
  if (!text.trim()) throw Error('Пустой текст для озвучивания');
  if (s.voice === 'fish') return fishSpeech(key, s.fishVoice, text, signal);
  return temp(async (dir) => {
    const out = path.join(dir, 'voice.wav');
    if (s.voice === 'system') {
      if (process.platform !== 'win32') throw Error('Системные голоса доступны в Windows');
      await ps(
        'Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; try { if($env:MIRA_VOICE){$s.SelectVoice($env:MIRA_VOICE)}; $s.SetOutputToWaveFile($env:MIRA_WAVE); $s.Speak($env:MIRA_TEXT) } finally {$s.Dispose()}',
        { MIRA_TEXT: text, MIRA_WAVE: out, MIRA_VOICE: s.systemVoice || '' },
        signal,
      );
    } else {
      const voice =
        s.voice === 'builtin'
          ? path.join(base, 'voices', 'ru_RU-ruslan-medium.onnx')
          : state.voices.find((v) => v.id === s.voice)?.path;
      if (!voice) throw Error('Голос не найден');
      const exe = path.join(base, 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
      await childRun(exe, ['--model', voice, '--output_file', out], text + '\n', signal);
    }
    return fs.readFile(out);
  });
}
module.exports = { transcribe, speak, ps, childRun };
