// Exercise the same window and IPC routes that a person uses, including one
// complete turn from a microphone fixture through speech playback to listening.
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import dgram from 'node:dgram';
import { microphoneWav } from './microphone-fixture.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const windows = process.platform === 'win32';
const executable = process.env.MIRA_ELECTRON || path.join(root, 'build/desktop/Mira/Mira.exe');
const engines = process.env.MIRA_ENGINE_DIR || path.join(root, 'build/desktop/Mira/resources/engines');
const profile = await mkdtemp(path.join(os.tmpdir(), 'mira-desk-smoke-'));
const evidence = process.env.MIRA_EVIDENCE;
if (evidence) await mkdir(evidence, { recursive: true });

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
  const generated = await readFile(voice);
  assert.ok(
    generated.length > 1000 && generated.toString('ascii', 0, 4) === 'RIFF',
    'Packaged Piper must generate speech',
  );
  // Fixed microphone recording keeps pronunciation stable across Piper's random noise samples.
  await writeFile(mic, microphoneWav(await readFile(path.join(root, 'Desktop/tests/fixtures/note-ru.wav'))));
  const args = [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + mic + '%noloop',
  ];
  if (!windows)
    args.push(
      '--no-sandbox',
      '--disable-dev-shm-usage',
      process.env.MIRA_APP_DIR || path.join(root, 'Desktop'),
    );
  app = await _electron.launch({
    executablePath: executable,
    args,
    env: { ...env, MIRA_ENGINE_DIR: engines, MIRA_TEST_PROFILE: path.join(profile, 'data') },
    timeout: 65000,
  });
  const p = await app.firstWindow(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.locator('#introSkip').click();
  await expect(p.locator('#homeCharacter')).toHaveAttribute('aria-pressed', 'false');
  if (evidence) await p.screenshot({ path: path.join(evidence, 'home.png') });
  await p.locator('#navMenuButton').click();
  await p.locator('#homeCharacter').click();
  await p.waitForFunction(() => document.querySelector('#avatar')?.contentWindow.companion?.ready, null, {
    timeout: 90000,
  });
  if (evidence) await p.screenshot({ path: path.join(evidence, 'home-character.png') });
  for (const dest of ['desk', 'commands', 'model', 'voice', 'ai', 'plugins', 'settings']) {
    await p
      .locator('[data-go="' + dest + '"]')
      .first()
      .click();
    await p.waitForFunction((name) => document.querySelector('#area').dataset.page === name, dest);
    if (dest === 'desk') await expect(p.locator('.deskGrid')).toBeVisible();
    else assert.ok((await p.locator('#content h2').first().innerText()).length);
  }
  await p.locator('[data-go=commands]').first().click();
  await p.locator('.flowSide [data-act=edit]').first().click();
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
  await expect
    .poll(
      () =>
        p.evaluate(async () =>
          (await window.desk.call('state')).notes.some((x) => x.text === 'Сценарий сработал'),
        ),
      { timeout: 50000 },
    )
    .toBe(true);
  await p.locator('[data-go=home]').first().click();
  await p.evaluate(() => {
    window.voicePhases = [];
    const el = document.querySelector('#voiceStatus');
    new MutationObserver(() => window.voicePhases.push(el.textContent)).observe(el, {
      childList: true,
      subtree: true,
    });
  });
  const micControl = p.locator('#serviceMic');
  const outputControl = p.locator('#serviceVoice');
  await expect(micControl).toHaveAttribute('aria-pressed', 'false');
  await expect(outputControl).toHaveAttribute('aria-pressed', 'true');
  await p.evaluate(() => {
    window.servicesSeen = [];
    for (const id of ['serviceAI', 'serviceMic', 'serviceVoice']) {
      const el = document.getElementById(id);
      new MutationObserver(() => window.servicesSeen.push([id, el.dataset.state, el.title])).observe(el, {
        attributes: true,
        attributeFilter: ['data-state'],
      });
    }
  });
  await micControl.click();
  await p.waitForFunction(
    () => window.voicePhases.includes('Отвечаю…') && window.voicePhases.at(-1) === 'Слушаю. Можно говорить.',
    null,
    { timeout: 90000 },
  );
  const state = await p.evaluate(() => window.desk.call('state'));
  assert.ok(
    state.notes.some((x) => /купить молоко/i.test(x.text)),
    JSON.stringify(state.chats.map((c) => c.messages)),
  );
  assert.ok(state.chats.some((c) => c.messages.some((m) => m.text === 'Записала в заметки.')));
  const seen = await p.evaluate(() => window.servicesSeen);
  assert.ok(
    seen.some(
      ([id, status, title]) => id === 'serviceMic' && status === 'active' && title.includes('Распознаю'),
    ),
  );
  assert.ok(seen.some(([id, status]) => id === 'serviceVoice' && status === 'active'));
  assert.ok(!seen.some(([id, status]) => id === 'serviceAI' && status === 'active'));
  await expect(micControl).toHaveAttribute('aria-pressed', 'true');
  await micControl.click();
  await expect(micControl).toHaveAttribute('data-state', 'off');
  await expect(outputControl).toHaveAttribute('aria-pressed', 'true');
  await outputControl.click();
  await expect(outputControl).toHaveAttribute('aria-pressed', 'false');
  await p.reload();
  await expect(outputControl).toHaveAttribute('aria-pressed', 'false');
  await p.locator('[data-go=voice]').first().click();
  await micControl.click();
  await expect(micControl).toHaveAttribute('data-state', 'on');
  await expect(p.locator('#area')).toHaveAttribute('data-page', 'voice');
  await p.waitForFunction(
    async () =>
      (await window.desk.call('state')).notes.filter((n) => /купить молоко/i.test(n.text)).length >= 2,
    null,
    { timeout: 90000 },
  );
  await expect(outputControl).toHaveAttribute('data-state', 'off');
  await outputControl.click();
  await expect(outputControl).toHaveAttribute('aria-pressed', 'true');
  await p.locator('[data-go=voice]').first().click();
  await p.getByRole('button', { name: 'Проверить голос', exact: true }).click();
  await expect(outputControl).toHaveAttribute('data-state', 'active');
  await micControl.click();
  await expect(micControl).toHaveAttribute('aria-pressed', 'false');
  await expect(outputControl).toHaveAttribute('data-state', 'active');
  await outputControl.click();
  await expect(outputControl).toHaveAttribute('data-state', 'off');
  await expect(p.locator('#voiceBar')).toBeHidden();
  await outputControl.click();
  await p.locator('[data-act=testMic]').click();
  await expect(p.locator('#micReading')).toContainText('дБ');
  await expect(p.locator('[data-act=testMic]')).toContainText('Завершить');
  const input = await p
    .locator('#microphoneId option')
    .evaluateAll((options) => options.find((o) => o.value)?.value);
  assert.ok(input, 'The fake audio input should be selectable');
  await p.locator('#microphoneId').selectOption(input);
  await expect
    .poll(() => p.evaluate(async () => (await window.desk.call('state')).settings.microphoneId))
    .toBe(input);
  await p.locator('#wakeWindow').selectOption('10');
  await expect
    .poll(() => p.evaluate(async () => (await window.desk.call('state')).settings.wakeWindow))
    .toBe(10);
  await p.locator('[data-go=home]').first().click();
  await expect(p.locator('#voiceBar')).toBeHidden();
  await p.locator('[data-go=voice]').first().click();
  await expect(p.locator('[data-act=testMic]')).toContainText('Проверить микрофон');
  assert.deepEqual(await p.evaluate(async () => (await window.desk.call('state')).chats), state.chats);
  // Interrupt a real Piper output with an independently recorded utterance. The
  // first browser-microphone turn above also exercises the getUserMedia/worklet path.
  const recorded = await readFile(path.join(root, 'Desktop/tests/fixtures/note-ru.wav'));
  const interrupt = await p.evaluate(async (bytes) => {
    const { Voice } = await import('/audio.js');
    const states = [],
      heard = [],
      errors = [];
    const v = new Voice(
      async (text) => {
        heard.push(text);
        return 'Слушаю.';
      },
      (s) => states.push(s),
      (e) => errors.push(e.message),
    );
    v.enabled = true;
    v.settings = { sensitivity: 0.006, silence: 0.45, interruptReplies: true };
    v.reset();
    const ctx = await v.context(),
      clip = await ctx.decodeAudioData(Uint8Array.from(bytes).buffer);
    const pending = v.speak(
      'Сейчас я расскажу о планах на день. Ты можешь заговорить в любой момент, и я услышу твою новую фразу.',
    );
    const wait = async (condition) => {
      const end = Date.now() + 60000;
      while (!condition()) {
        if (Date.now() > end) throw Error('Timed out ' + JSON.stringify({ states, heard, errors }));
        await new Promise((r) => setTimeout(r, 35));
      }
    };
    try {
      await wait(() => v.speaker);
      const input = clip.getChannelData(0),
        size = 2048,
        start = ctx.currentTime;
      for (let i = 0; i < input.length; i += size)
        v.chunk(input.slice(i, i + size), start + i / ctx.sampleRate);
      for (let i = 0; i < 20; i++)
        v.chunk(new Float32Array(size), start + (input.length + i * size) / ctx.sampleRate);
      await pending;
      await wait(() => heard.length && !v.busy && !v.playing);
      return { states: [...states], heard, errors };
    } finally {
      v.stop(false);
      await ctx.close();
    }
  }, Array.from(recorded));
  assert.deepEqual(interrupt.errors, []);
  assert.match(interrupt.heard[0], /молоко/iu);
  assert.ok(interrupt.states.indexOf('Слышу тебя…') > interrupt.states.indexOf('Отвечаю…'));
  assert.equal(interrupt.states.filter((s) => s === 'Отвечаю…').length, 2);
  assert.equal(interrupt.states.at(-1), 'Слушаю. Можно говорить.');
  console.log(
    'Microphone meter, device selection, follow-up preference and interruption with real local transcription and synthesis passed.',
  );
  // Receive a real VMC stream on loopback, including when the model page is hidden.
  const listener = dgram.createSocket('udp4');
  await new Promise((resolve) => listener.bind(0, '127.0.0.1', resolve));
  try {
    const bones = new Set(),
      headPoses = new Set(),
      blend = new Set();
    listener.on('message', (data) => {
      assert.equal(data.subarray(0, 8).toString(), '#bundle\0');
      for (let offset = 16; offset + 4 < data.length; ) {
        const size = data.readUInt32BE(offset),
          m = data.subarray(offset + 4, offset + 4 + size);
        let i = 0;
        const readString = () => {
          const e = m.indexOf(0, i),
            s = m.toString('utf8', i, e);
          i = (e + 4) & ~3;
          return s;
        };
        const address = readString();
        readString();
        if (address === '/VMC/Ext/Bone/Pos') {
          const name = readString();
          bones.add(name);
          if (name === 'Head') headPoses.add(m.subarray(i).toString('hex'));
        }
        if (address === '/VMC/Ext/Blend/Val') blend.add(readString());
        offset += 4 + size;
      }
    });
    await p.locator('[data-go=model]').first().click();
    await p.locator('[data-act=modelSection][data-id=advanced]').click();
    await p.locator('#motionPort').fill(String(listener.address().port));
    await p.locator('[data-act=motionOutput]').click();
    await expect
      .poll(() => p.evaluate(async () => (await window.desk.call('state')).motionPort))
      .toBe(listener.address().port);
    await p.locator('[data-go=plugins]').first().click();
    for (let i = 0; i < 100 && !(bones.size >= 48 && headPoses.size >= 3 && blend.has('A')); i++)
      await new Promise((r) => setTimeout(r, 100));
    assert.ok(
      bones.has('LeftHand') &&
        bones.has('LeftIndexDistal') &&
        bones.has('RightFoot') &&
        headPoses.size >= 3 &&
        blend.has('Blink') &&
        blend.has('A'),
      'Stream must contain moving bones, fingers, feet, eyes and mouth',
    );
    console.log('VMC received', bones.size, 'animated bones and', blend.size, 'face channels');
    await p.evaluate(() => window.desk.call('motionOutput', { port: 0 }));
  } finally {
    listener.close();
  }
  const next = app.waitForEvent('window');
  await p.locator('#navMenuButton').click();
  await p.locator('#topOverlay').click();
  const overlay = await next;
  await overlay.waitForFunction(
    () => document.querySelector('#avatar')?.contentWindow.companion?.ready,
    null,
    { timeout: 90000 },
  );
  await p.locator('[data-go=model]').first().click();
  await p.locator('[data-act=modelSection][data-id=window]').click();
  await p.locator('#overlayHeight').selectOption('300');
  await p.locator('#overlayAnchor').selectOption('top-left');
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow, screen }) => {
        const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/overlay.html'));
        const rect = w.getBounds(),
          area = screen.getDisplayMatching(rect).workArea;
        return [rect.x - area.x, rect.y - area.y, rect.height];
      }),
    )
    .toEqual([20, 15, 300]);
  await p.evaluate(() => window.desk.call('overlay', { open: false }));
  assert.deepEqual(errors, []);
  console.log(
    'Main window, seven sections, VRM, workflow with speech, hands-free conversation and separate avatar window passed.',
  );
} finally {
  if (app) await app.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 350 });
}
