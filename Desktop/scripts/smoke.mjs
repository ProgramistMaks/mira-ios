// Exercise the same window and IPC routes that a person uses, including one
// complete turn from a microphone fixture through speech playback to listening.
import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const windows = process.platform === 'win32';
const executable = process.env.MIRA_ELECTRON || path.join(root, 'build/desktop/Mira/Mira.exe');
const engines = process.env.MIRA_ENGINE_DIR || path.join(root, 'build/desktop/Mira/resources/engines');
const profile = await mkdtemp(path.join(os.tmpdir(), 'mira-desk-smoke-'));
const evidence = process.env.MIRA_EVIDENCE;
if (evidence) await mkdir(evidence, { recursive: true });

function microphoneWav(raw) {
  let rate, channels, pcm;
  for (let off = 12; off + 8 <= raw.length; ) {
    const size = raw.readUInt32LE(off + 4),
      kind = raw.toString('ascii', off, off + 4);
    if (kind === 'fmt ') {
      assert.equal(raw.readUInt16LE(off + 8), 1);
      channels = raw.readUInt16LE(off + 10);
      rate = raw.readUInt32LE(off + 12);
      assert.equal(raw.readUInt16LE(off + 22), 16);
    }
    if (kind === 'data') pcm = raw.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  assert.ok(pcm && channels && rate);
  const sampleRate = 48000,
    speechSamples = Math.floor(((pcm.length / (2 * channels)) * sampleRate) / rate);
  const count = sampleRate * 10 + speechSamples,
    b = Buffer.alloc(44 + 2 * count);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(2 * sampleRate, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = 0; i < speechSamples; i++)
    b.writeInt16LE(
      pcm.readInt16LE(2 * channels * Math.floor((i * rate) / sampleRate)),
      44 + 2 * (i + 2 * sampleRate),
    );
  return b;
}
let app;
try {
  const voice = path.join(profile, 'voice.wav'),
    mic = path.join(profile, 'mic.wav');
  const piper = path.join(engines, 'piper', windows ? 'piper.exe' : 'piper');
  const env = { ...process.env, PATH: path.join(engines, 'msvc') + path.delimiter + process.env.PATH };
  const spoken = spawnSync(
    piper,
    ['--model', path.join(engines, 'voices/ru_RU-ruslan-medium.onnx'), '--output_file', voice],
    { cwd: path.dirname(piper), env, input: 'Запиши купить молоко.\n', encoding: 'utf8', timeout: 90000 },
  );
  assert.equal(spoken.status, 0, spoken.stderr || spoken.error?.message);
  await writeFile(mic, microphoneWav(await readFile(voice)));
  const args = [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + mic + '%noloop',
  ];
  if (!windows) args.push('--no-sandbox', '--disable-dev-shm-usage', path.join(root, 'Desktop'));
  app = await _electron.launch({
    executablePath: executable,
    args,
    env: { ...env, MIRA_ENGINE_DIR: engines, MIRA_TEST_PROFILE: path.join(profile, 'data') },
    timeout: 65000,
  });
  const p = await app.firstWindow(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.waitForFunction(() => document.querySelector('#avatar')?.contentWindow.companion?.ready, null, {
    timeout: 90000,
  });
  if (evidence) await p.screenshot({ path: path.join(evidence, 'home.png') });
  for (const dest of ['desk', 'commands', 'model', 'voice', 'ai', 'plugins', 'settings']) {
    await p
      .locator('[data-go="' + dest + '"]')
      .first()
      .click();
    await p.waitForFunction((name) => document.querySelector('#area').dataset.page === name, dest);
    assert.ok((await p.locator('#content h2').first().innerText()).length);
  }
  await p.locator('[data-go=commands]').first().click();
  await p.locator('.flowNode[data-node]').first().waitFor();
  if (evidence) await p.screenshot({ path: path.join(evidence, 'commands.png') });
  await p.locator('[data-act=newRoutine]').click();
  await p.locator('#rName').fill('Проверка сценария');
  await p.locator('#rPhrase').fill('выполни проверку');
  await p.locator('#nodeValue').fill('Проверяю голос.');
  await p.locator('#kind').selectOption('note');
  await p.locator('[data-act=addBlock]').click();
  await p.locator('#nodeValue').fill('Сценарий сработал');
  await p.locator('[data-act=runRoutine]').click();
  await p.waitForFunction(
    async () => (await window.desk.call('state')).notes.some((x) => x.text === 'Сценарий сработал'),
    null,
    { timeout: 50000 },
  );
  await p.locator('[data-go=home]').first().click();
  await p.evaluate(() => {
    window.voicePhases = [];
    const el = document.querySelector('#voiceStatus');
    new MutationObserver(() => window.voicePhases.push(el.textContent)).observe(el, {
      childList: true,
      subtree: true,
    });
  });
  await p.locator('#voiceStart').click();
  await p.waitForFunction(
    () =>
      window.voicePhases.includes('Отвечаю…') && window.voicePhases.at(-1) === 'Слушаю. Можно говорить.',
    null,
    { timeout: 90000 },
  );
  const state = await p.evaluate(() => window.desk.call('state'));
  assert.ok(state.notes.some((x) => /купить молоко/i.test(x.text)));
  assert.ok(state.chats.some((c) => c.messages.some((m) => m.text === 'Записала в заметки.')));
  await p.locator('#voiceEnd').click();
  const next = app.waitForEvent('window');
  await p.locator('#topOverlay').click();
  const overlay = await next;
  await overlay.waitForFunction(
    () => document.querySelector('#avatar')?.contentWindow.companion?.ready,
    null,
    { timeout: 90000 },
  );
  await p.evaluate(() => window.desk.call('overlay', { open: false }));
  assert.deepEqual(errors, []);
  console.log(
    'Main window, seven sections, VRM, workflow with speech, hands-free conversation and separate avatar window passed.',
  );
} finally {
  if (app) await app.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 350 });
}
