import { call, mouth } from './shared.js';
export function wav(samples, rate) {
  const n = Math.floor((samples.length * 16000) / rate),
    buf = new ArrayBuffer(44 + n * 2),
    d = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  d.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, 16000, true);
  d.setUint32(28, 32000, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  str(36, 'data');
  d.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * rate) / 16000),
      b = Math.min(samples.length, Math.max(a + 1, Math.floor(((i + 1) * rate) / 16000)));
    let sum = 0;
    for (let j = a; j < b; j++) sum += samples[j];
    d.setInt16(44 + 2 * i, Math.max(-1, Math.min(1, sum / (b - a))) * 32767, true);
  }
  return new Uint8Array(buf);
}
function join(frames) {
  const data = new Float32Array(frames.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const f of frames) {
    data.set(f, at);
    at += f.length;
  }
  return data;
}
export class Voice {
  constructor(onTurn, onStatus, onError, localOnly = () => false) {
    Object.assign(this, { onTurn, onStatus, onError, localOnly });
    this.epoch = 0;
    this.audioEpoch = 0;
    this.enabled = false;
  }
  async context() {
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
    await this.ctx.resume();
    return this.ctx;
  }
  reset() {
    this.pre = [];
    this.frames = [];
    this.talking = 0;
    this.quiet = 0;
    this.recording = false;
  }
  async start() {
    this.stop(false);
    const e = this.epoch;
    this.enabled = true;
    this.onStatus('Доступ к микрофону…', 'listening');
    try {
      const ctx = await this.context();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (this.epoch !== e) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      if (!this.loaded) {
        await ctx.audioWorklet.addModule('/pcm.js');
        this.loaded = true;
      }
      if (this.epoch !== e) return;
      this.source = ctx.createMediaStreamSource(stream);
      this.proc = new AudioWorkletNode(ctx, 'mira-pcm');
      this.mute = ctx.createGain();
      this.mute.gain.value = 0;
      this.proc.port.onmessage = (ev) => this.chunk(ev.data);
      this.source.connect(this.proc).connect(this.mute).connect(ctx.destination);
      this.reset();
      this.busy = false;
      this.onStatus('Слушаю. Можно говорить.', 'listening');
    } catch (err) {
      if (e === this.epoch) {
        this.stop();
        throw err;
      }
    }
  }
  chunk(buf) {
    if (!this.enabled || this.busy || this.playing) return;
    let power = 0;
    for (const x of buf) power += x * x;
    const voiced = Math.sqrt(power / buf.length) > (this.settings?.sensitivity ?? 0.012),
      sec = buf.length / this.ctx.sampleRate;
    if (!this.recording) {
      this.pre.push(buf);
      if (this.pre.length > Math.ceil(0.45 / sec)) this.pre.shift();
      this.talking = voiced ? this.talking + sec : 0;
      if (this.talking < 0.12) return;
      this.recording = true;
      this.frames = this.pre;
      this.pre = [];
      this.onStatus('Слышу тебя…', 'listening');
    } else this.frames.push(buf);
    this.quiet = voiced ? 0 : this.quiet + sec;
    if (this.quiet < (this.settings?.silence ?? 0.78) && this.frames.length * sec < 70) return;
    const bytes = wav(join(this.frames), this.ctx.sampleRate);
    this.reset();
    this.turn(bytes).catch((e) => this.onError(e));
  }
  async turn(bytes) {
    const e = this.epoch;
    this.busy = true;
    this.onStatus('Распознаю фразу…', 'thinking');
    try {
      const text = await call('transcribe', { bytes, localOnly: this.localOnly() });
      if (e !== this.epoch || !text.trim()) return;
      this.onStatus('Думаю…', 'thinking');
      let result;
      try {
        result = await this.onTurn(text);
      } catch (err) {
        if (e !== this.epoch) return;
        this.onError(err);
        result = /скачайте модель/iu.test(err.message)
          ? 'Для свободного разговора выбери модель во вкладке ИИ. Я уже могу записывать заметки, ставить таймер и искать в интернете.'
          : 'Сейчас не удалось получить ответ. Я снова слушаю.';
      }
      if (e === this.epoch && result) await this.speak(result);
    } catch (err) {
      if (e === this.epoch) this.onError(err);
    } finally {
      if (e === this.epoch) {
        this.busy = false;
        this.reset();
        this.onStatus('Слушаю. Можно говорить.', 'listening');
      }
    }
  }
  async speak(text, fishPreview) {
    this.hush();
    const id = this.audioEpoch;
    this.playing = true;
    this.onStatus('Отвечаю…', 'speaking');
    try {
      const ctx = await this.context();
      const data = await call('speech', { text, continuous: this.enabled, fishPreview });
      if (id !== this.audioEpoch) return;
      const b = await ctx.decodeAudioData(new Uint8Array(data).buffer);
      if (id !== this.audioEpoch) return;
      const src = ctx.createBufferSource(),
        meter = ctx.createAnalyser();
      meter.fftSize = 512;
      src.buffer = b;
      src.playbackRate.value = this.settings?.speechRate ?? 1;
      const output = ctx.createGain();
      output.gain.value = this.settings?.speechVolume ?? 1;
      src.connect(meter).connect(output).connect(ctx.destination);
      this.speaker = src;
      const values = new Float32Array(meter.fftSize);
      const step = () => {
        if (this.speaker !== src) return;
        meter.getFloatTimeDomainData(values);
        let sum = 0;
        for (const x of values) sum += x * x;
        mouth(Math.min(1, 4 * Math.sqrt(sum / values.length)));
        this.raf = requestAnimationFrame(step);
      };
      step();
      await new Promise((resolve) => {
        src.onended = resolve;
        src.start();
      });
      output.disconnect();
      meter.disconnect();
      src.disconnect();
    } finally {
      if (id === this.audioEpoch) {
        this.hush();
        this.onStatus(this.enabled ? 'Слушаю. Можно говорить.' : '', this.enabled ? 'listening' : 'idle');
      }
    }
  }
  hush() {
    this.audioEpoch++;
    cancelAnimationFrame(this.raf);
    const src = this.speaker;
    this.speaker = null;
    if (src) {
      try {
        src.stop();
      } catch {}
    }
    this.playing = false;
    mouth(0);
  }
  stop(cancel = true) {
    this.epoch++;
    this.enabled = false;
    this.busy = false;
    this.hush();
    this.reset();
    this.proc?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (cancel) call('stop').catch(() => {});
    this.onStatus('', 'idle');
  }
  async decode(data) {
    const ctx = await this.context();
    const b = await ctx.decodeAudioData(new Uint8Array(data).buffer);
    return wav(b.getChannelData(0), b.sampleRate);
  }
}
