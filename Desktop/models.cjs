const fs = require('node:fs'),
  fsp = fs.promises,
  path = require('node:path'),
  os = require('node:os'),
  net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { setTimeout: delay } = require('node:timers/promises');
const catalog = [
  [
    'qwen27',
    'Qwen3.8 27B',
    'UD-Q4_K_M',
    'Qwen3.8-27B',
    '4af51b3542f775b0a8e4b310bfb3f17e01c306c9',
    16564259744,
    '1bce504dfecd84153666928a41d8a66706f0158d3a317bc5196b72819d7dc529',
    32,
  ],
  [
    'qwen9',
    'Qwen3.5 9B',
    'Q4_K_M',
    'Qwen3.5-9B',
    '3885219b6810b007914f3a7950a8d1b469d598a5',
    5680522464,
    '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
    16,
  ],
  [
    'qwen9q3',
    'Qwen3.5 9B',
    'Q3_K_M',
    'Qwen3.5-9B',
    '3885219b6810b007914f3a7950a8d1b469d598a5',
    4673643744,
    '8fed90306e4f019e2bf35f3766470b7bc59ea1a9dae00f5ceb20b43cb5514393',
    12,
  ],
  [
    'qwen4',
    'Qwen3.5 4B',
    'Q4_K_M',
    'Qwen3.5-4B',
    'e87f176479d0855a907a41277aca2f8ee7a09523',
    2740937888,
    '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
    8,
  ],
  [
    'gemma',
    'Google Gemma 3 4B',
    'Q4_K_M',
    'gemma-3-4b-it',
    '5a3566e716d80f709ed7b79817eaf7733d2a1fce',
    2489894016,
    '04a43a22e8d2003deda5acc262f68ec1005fa76c735a9962a8c77042a74a7d19',
    8,
  ],
  [
    'kimi-linear',
    'Kimi Linear 48B A3B Instruct',
    'Q4_K_M',
    'moonshotai_Kimi-Linear-48B-A3B-Instruct',
    '228dbe476e5a02091624a19068f4c962caa8a1c5',
    30061058720,
    'a1a7d865370652221f937163f7e94c99e1f114861335ba4f8666606843f1620f',
    48,
    'bartowski/moonshotai_Kimi-Linear-48B-A3B-Instruct-GGUF',
  ],
  [
    'qwen2',
    'Qwen3.5 2B',
    'Q4_K_M',
    'Qwen3.5-2B',
    'f6d5376be1edb4d416d56da11e5397a961aca8ae',
    1280835840,
    'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    6,
  ],
].map(([id, name, quant, base, revision, bytes, hash, ram, repository]) => ({
  id,
  name,
  quant,
  bytes,
  hash,
  ram,
  url:
    'https://huggingface.co/' +
    (repository || 'unsloth/' + base + '-GGUF') +
    '/resolve/' +
    revision +
    '/' +
    base +
    '-' +
    quant +
    '.gguf',
}));
// Vision encoders belong to a specific upstream model revision, independently of the text quantization.
const encoders = {
  qwen2: [668227264, '7035e9cb8d7c6a9681d07eef9a364783e86ea4cd73faab2eabb4f43a101830c7'],
  qwen4: [672423616, 'cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864'],
  qwen9: [918166080, 'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f'],
  qwen27: [927607488, 'cbb841a9ee0636b2ec172f5bb8df2ea8dfeb01e90fe7c6126581d662a0b4e43e'],
  gemma: [851251328, '731199e016ec5f227b8293fef839899472e0ee4c51adf5f9e5cb66f6558fa142'],
};
function encoder(m) {
  const data = encoders[m.id === 'qwen9q3' ? 'qwen9' : m.id];
  return data && { bytes: data[0], hash: data[1], url: new URL('mmproj-F16.gguf', m.url).href };
}
function encoderPath(dir, m) {
  return path.join(dir, encoder(m).hash + '.mmproj.gguf');
}
const bytesAt = (p) => {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
};
async function download(model, file, signal, progress) {
  const part = file + '.part';
  let start = bytesAt(part);
  if (start > model.bytes) {
    await fsp.unlink(part);
    start = 0;
  }
  const disk = await fsp.statfs(path.dirname(file));
  if (disk.bavail * disk.bsize < model.bytes - start + 16000000) throw Error('Недостаточно места на диске');
  if (start < model.bytes) {
    const r = await fetch(model.url, { headers: start ? { Range: 'bytes=' + start + '-' } : {}, signal });
    if (!r.ok) throw Error('Загрузка недоступна (' + r.status + ')');
    if (r.status === 206) {
      if (!r.headers.get('content-range')?.startsWith('bytes ' + start + '-'))
        throw Error('Сервер вернул другой диапазон файла');
    } else start = 0;
    let count = start,
      last = 0;
    progress(start);
    const meter = new Transform({
      transform(chunk, enc, cb) {
        count += chunk.length;
        if (count > model.bytes) return cb(Error('Неподходящий размер файла'));
        if (Date.now() - last > 220) {
          progress(count);
          last = Date.now();
        }
        cb(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(r.body),
      meter,
      fs.createWriteStream(part, { flags: start ? 'a' : 'w' }),
      { signal },
    );
  }
  if (bytesAt(part) !== model.bytes) throw Error('Загрузка прервалась. Её можно продолжить');
  progress(model.bytes);
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(part, { signal })) hash.update(chunk);
  if (hash.digest('hex') !== model.hash) {
    await fsp.unlink(part);
    throw Error('Контрольная сумма файла не совпала. Повторите загрузку');
  }
  await fsp.rename(part, file);
}
async function freePort() {
  const s = net.createServer();
  await new Promise((ok, no) => s.once('error', no).listen(0, '127.0.0.1', ok));
  const port = s.address().port;
  await new Promise((ok) => s.close(ok));
  return port;
}
class LocalModels {
  constructor(dir, exe, notify) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.exe = exe;
    this.notify = notify;
    this.active = null;
    this.starting = null;
    this.server = null;
  }
  list() {
    return catalog.map((m) => ({
      id: m.id,
      name: m.name,
      quant: m.quant,
      bytes: m.bytes,
      ram: m.ram,
      recommended: os.totalmem() / 2 ** 30 >= m.ram - 0.5,
      installed: bytesAt(path.join(this.dir, m.id + '.gguf')) === m.bytes,
      partial: bytesAt(path.join(this.dir, m.id + '.gguf.part')),
      busy: this.active?.id === m.id && !this.active.vision,
      visionBytes: encoder(m)?.bytes || 0,
      visionPartial: encoder(m) ? bytesAt(encoderPath(this.dir, m) + '.part') : 0,
      visionInstalled: !!encoder(m) && bytesAt(encoderPath(this.dir, m)) === encoder(m).bytes,
      visionBusy: !!encoder(m) && this.active?.vision === encoder(m).hash,
    }));
  }
  startDownload(id, vision = false) {
    const m = catalog.find((x) => x.id === id);
    if (!m) throw Error('Неизвестная модель');
    if (this.active) throw Error('Уже идёт загрузка');
    const asset = vision ? encoder(m) : m;
    if (!asset) throw Error('У этой модели нет модуля изображений');
    const file = vision ? encoderPath(this.dir, m) : path.join(this.dir, id + '.gguf');
    if (bytesAt(file) === asset.bytes) return;
    const abort = new AbortController();
    this.active = { id, abort, vision: vision ? asset.hash : null };
    download(asset, file, abort.signal, (count) =>
      this.notify({ type: 'download', id, count, total: asset.bytes, vision }),
    )
      .then(() => this.notify({ type: 'downloaded', id }))
      .catch((e) =>
        this.notify({
          type: 'downloadEnd',
          error: !abort.signal.aborted,
          message: abort.signal.aborted ? 'Загрузка приостановлена' : e.message,
        }),
      )
      .finally(() => {
        this.active = null;
        this.notify({ type: 'models' });
      });
  }
  async remove(id, visionOnly = false) {
    const model = catalog.find((m) => m.id === id);
    if (!model) throw Error('Неизвестная модель');
    if (this.active || this.starting) throw Error('Сначала дождитесь остановки загрузки или запуска модели');
    const module = encoder(model);
    if (visionOnly && !module) throw Error('Для этой модели модуль изображений недоступен');
    const current = catalog.find((m) => m.id === this.server?.id);
    if (
      (!visionOnly && this.server?.id === id) ||
      (visionOnly && this.server?.vision && current && encoder(current)?.hash === module.hash)
    ) {
      const child = this.server.child,
        closed = new Promise((resolve) => child.once('close', resolve));
      this.stop();
      await closed;
    }
    const file = path.join(this.dir, model.id + '.gguf');
    const files = visionOnly ? [] : [file, file + '.part'];
    if (
      encoder(model) &&
      (visionOnly ||
        !catalog.some(
          (m) =>
            m.id !== id &&
            encoder(m)?.hash === encoder(model).hash &&
            bytesAt(path.join(this.dir, m.id + '.gguf')) === m.bytes,
        ))
    ) {
      const proj = encoderPath(this.dir, model);
      files.push(proj, proj + '.part');
    }
    await Promise.all(files.map((f) => fsp.rm(f, { force: true })));
  }
  cancel() {
    this.active?.abort.abort();
  }
  stop() {
    this.generation = (this.generation || 0) + 1;
    this.server?.child.kill();
    this.server = null;
  }
  async connection(id, vision = false) {
    while (this.starting) await this.starting;
    if (this.server?.id === id && (!vision || this.server.vision) && !this.server.child.killed)
      return this.server;
    const pending = this.launch(id, vision);
    this.starting = pending;
    try {
      return await pending;
    } finally {
      if (this.starting === pending) this.starting = null;
    }
  }
  async launch(id, vision) {
    const m = catalog.find((x) => x.id === id),
      file = path.join(this.dir, (m?.id || '') + '.gguf');
    if (!m || bytesAt(file) !== m.bytes)
      throw Error('Скачайте модель во вкладке «ИИ» или выберите подключённый сервис');
    if (vision && (!encoder(m) || bytesAt(encoderPath(this.dir, m)) !== encoder(m).bytes))
      throw Error(
        encoder(m)
          ? 'Скачай модуль изображений для ' + m.name + ' в разделе «ИИ».'
          : 'Для изображений выбери модель с поддержкой зрения.',
      );
    this.stop();
    const generation = this.generation,
      port = await freePort(),
      key = randomUUID();
    if (this.generation !== generation) throw Error('Запуск модели отменён');
    const child = spawn(
      this.exe,
      [
        '-m',
        file,
        ...(vision ? ['--mmproj', encoderPath(this.dir, m)] : []),
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--api-key',
        key,
        '--alias',
        id,
        '-c',
        '4096',
        '-ngl',
        'auto',
      ],
      { cwd: path.dirname(this.exe), windowsHide: true, stdio: 'ignore' },
    );
    let error;
    child.once('error', (e) => {
      error = e;
    });
    const server = { child, id, key, vision, base: 'http://127.0.0.1:' + port + '/v1' };
    this.server = server;
    child.once('exit', () => {
      if (this.server === server) this.server = null;
    });
    try {
      for (let n = 0; n < 360; n++) {
        if (error || child.exitCode !== null || this.generation !== generation)
          throw Error('Движок остановился. Проверьте свободную память или выберите модель меньшего размера');
        try {
          const r = await fetch('http://127.0.0.1:' + port + '/health', {
            headers: { Authorization: 'Bearer ' + key },
            signal: AbortSignal.timeout(1500),
          });
          if (r.ok) return server;
        } catch {}
        await delay(500);
      }
      throw Error('Истекло время загрузки модели');
    } catch (e) {
      child.kill();
      if (this.server === server) this.server = null;
      throw e;
    }
  }
}
module.exports = { catalog, download, LocalModels };
