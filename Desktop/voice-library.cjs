const fs = require('node:fs/promises'),
  path = require('node:path');
const { createReadStream } = require('node:fs'),
  { createHash } = require('node:crypto');
const { download } = require('./models.cjs');
const id = 'piper-irina',
  base =
    'https://huggingface.co/rhasspy/piper-voices/resolve/0ca208afc2a2ee102b1e961e72e0a7e4907be3d0/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx';
const parts = [
  ['', 63201294, '8ff38212d23da300bbe3705c645e6e5b9475f0bfde01558eb17813e22acaaaaa'],
  ['.json', 4765, 'c2ec28bb38e2b59e93b959b3e40348c1afebbd272f30fed5d41205d08e98a9d7'],
];
class VoiceLibrary {
  constructor() {
    this.job = null;
  }
  async install(store, onChange) {
    if (this.job) throw Error('Голос уже загружается');
    const controller = new AbortController();
    this.job = controller;
    try {
      const dir = path.join(store.dir, 'library', id),
        file = path.join(dir, 'voice.onnx');
      await fs.mkdir(dir, { recursive: true });
      for (const [ext, bytes, hash] of parts) {
        if ((await fs.stat(file + ext).catch(() => null))?.size === bytes) {
          const sum = createHash('sha256');
          for await (const chunk of createReadStream(file + ext, { signal: controller.signal }))
            sum.update(chunk);
          if (sum.digest('hex') === hash) continue;
        }
        await download({ url: base + ext, bytes, hash }, file + ext, controller.signal, () => {});
      }
      store.data.voices = [
        ...store.data.voices.filter((v) => v.id !== id),
        { id, name: 'Ирина · русский', path: file },
      ];
      store.data.settings.voice = id;
      onChange();
      return id;
    } finally {
      this.job = null;
    }
  }
  stop() {
    this.job?.abort();
  }
}
module.exports = { VoiceLibrary };
