import { outputReference, isPlaybackEcho } from './voice-signal.mjs';
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
    this.testing = false;
    this.turnId = 0;
    this.replyEpoch = 0;
    this.captureId = 0;
  }
  async devices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === 'audioinput'),
      outputs: devices.filter((d) => d.kind === 'audiooutput'),
      canRoute: typeof AudioContext.prototype.setSinkId === 'function',
    };
  }
  async route(id = this.settings?.speakerId || '') {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (!ctx.setSinkId) {
      if (id) throw Error('Выбор динамиков на этом компьютере недоступен');
      return;
    }
    if (ctx.sinkId === id) return;
    try {
      await ctx.setSinkId(id);
    } catch (err) {
      if (id && err.name === 'NotFoundError') {
        await ctx.setSinkId('');
        this.onError(Error('Динамики отключены. Использую системный выход.'));
        return;
      }
      throw err;
    }
  }
  async context() {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
      this.loaded = false;
    }
    await this.route();
    await this.ctx.resume();
    return this.ctx;
  }
  reset() {
    this.pre = [];
    this.frames = [];
    this.talking = 0;
    this.quiet = 0;
    this.recording = false;
    this.overlap = [];
    this.overlapTime = 0;
  }
  async getInput(id = this.settings?.microphoneId || '') {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: id ? { ...audio, deviceId: { exact: id } } : audio,
      });
    } catch (err) {
      if (!id || !['OverconstrainedError', 'NotFoundError'].includes(err.name)) throw err;
      this.onError(Error('Выбранный микрофон отключён. Использую системный микрофон.'));
      return navigator.mediaDevices.getUserMedia({ audio });
    }
  }
  async switchInput(id) {
    if (!this.stream || !this.proc) return;
    const request = ++this.captureId,
      epoch = this.epoch;
    const stream = await this.getInput(id);
    if (request !== this.captureId || epoch !== this.epoch) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.source.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    this.bindInput(stream);
    this.reset();
  }
  bindInput(stream) {
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.proc);
    stream.getAudioTracks()[0].onended = () => {
      if (stream !== this.stream) return;
      this.switchInput('').catch((e) => {
        if (stream === this.stream) {
          this.stop();
          this.onError(e);
        }
      });
    };
  }
  async start(test = false, keepOutput = false) {
    this.stop(false, keepOutput);
    const e = this.epoch;
    this.testing = test;
    this.enabled = !test;
    this.onStatus('Доступ к микрофону…', 'listening');
    try {
      const ctx = await this.context();
      const stream = await this.getInput();
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
      this.proc = new AudioWorkletNode(ctx, 'mira-pcm');
      this.mute = ctx.createGain();
      this.mute.gain.value = 0;
      this.proc.port.onmessage = (ev) => {
        if (e === this.epoch) this.chunk(ev.data.samples, ev.data.time);
      };
      this.bindInput(stream);
      this.proc.connect(this.mute).connect(ctx.destination);
      this.reset();
      this.busy = false;
      this.onStatus(test ? 'Проверка микрофона' : 'Слушаю. Можно говорить.', 'listening');
    } catch (err) {
      if (e === this.epoch) {
        this.stop(!keepOutput, keepOutput);
        throw err;
      }
    }
  }
  chunk(buf, time) {
    if ((!this.enabled && !this.testing) || !buf?.length) return;
    let power = 0;
    for (const x of buf) power += x * x;
    const rms = Math.sqrt(power / buf.length),
      threshold = this.settings?.sensitivity ?? 0.012;
    let voiced = rms > threshold,
      sec = buf.length / this.ctx.sampleRate;
    this.onMeter?.(rms, this.stream?.getAudioTracks()[0]?.label || '');
    if (this.testing) return;
    if (this.tail) {
      if (time > this.tail.until) this.tail = null;
      else if (voiced && isPlaybackEcho(buf, this.ctx.sampleRate, time, this.tail.reference)) voiced = false;
    }
    if (this.playing) {
      if (!this.speaker || this.settings?.interruptReplies === false) return;
      if (
        isPlaybackEcho(buf, this.ctx.sampleRate, time, this.reference) ||
        (rms < Math.max(0.014, threshold * 1.35) && (!this.overlapTime || this.overlapQuiet > 0.08))
      ) {
        this.overlapTime = 0;
        this.overlapQuiet = 0;
        this.overlap = [];
        return;
      }
      this.overlap.push(buf);
      if (rms < Math.max(0.014, threshold * 1.35)) {
        this.overlapQuiet += sec;
        return;
      }
      this.overlapQuiet = 0;
      this.overlapTime += sec;
      if (this.overlapTime < 0.22) return;
      const captured = this.overlap;
      // The interrupted turn may still be awaiting audio completion. Its finally must
      // not discard the first syllables of the replacement turn.
      this.turnId++;
      this.hush();
      this.busy = false;
      this.reset();
      this.frames = captured;
      this.recording = true;
      this.onStatus('Слышу тебя…', 'listening');
      return;
    }
    if (this.busy) return;
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
    const e = this.epoch,
      turn = ++this.turnId,
      reply = ++this.replyEpoch;
    const active = () => e === this.epoch && turn === this.turnId;
    this.busy = true;
    this.transcribing = true;
    this.onStatus('Распознаю фразу…', 'thinking');
    try {
      const text = await call('transcribe', { bytes, localOnly: this.localOnly() });
      if (!active()) return;
      this.transcribing = false;
      if (!text.trim()) return;
      this.onStatus('Думаю…', 'thinking');
      let result;
      try {
        result = await this.onTurn(text);
      } catch (err) {
        if (!active()) return;
        this.onError(err);
        result = /скачайте модель/iu.test(err.message)
          ? 'Для свободного разговора выбери модель во вкладке ИИ. Я уже могу записывать заметки, ставить таймер и искать в интернете.'
          : 'Сейчас не удалось получить ответ. Я снова слушаю.';
      }
      // Turning off input after transcription still lets this reply finish aloud.
      if (reply === this.replyEpoch && result) await this.speak(result);
    } catch (err) {
      if (active()) this.onError(err);
    } finally {
      if (active()) {
        this.transcribing = false;
        this.busy = false;
        this.reset();
        this.onStatus('Слушаю. Можно говорить.', 'listening');
      }
    }
  }
  async speak(text, fishPreview) {
    if (this.settings?.ttsEnabled === false) return;
    this.hush();
    const id = this.audioEpoch;
    this.playing = true;
    this.onStatus('Отвечаю…', 'speaking');
    try {
      const ctx = await this.context();
      if (id !== this.audioEpoch) return;
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
      const start = ctx.currentTime;
      this.reference =
        this.enabled && this.settings?.interruptReplies !== false
          ? outputReference(b.getChannelData(0), b.sampleRate, src.playbackRate.value, start)
          : null;
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
        src.start(start);
      });
      output.disconnect();
      meter.disconnect();
      src.disconnect();
    } catch (err) {
      if (id === this.audioEpoch) throw err;
    } finally {
      if (id === this.audioEpoch) {
        this.hush();
        this.onStatus(this.enabled ? 'Слушаю. Можно говорить.' : '', this.enabled ? 'listening' : 'idle');
      }
    }
  }
  silence() {
    if (!this.playing) return;
    this.hush();
    this.onStatus(this.enabled ? 'Слушаю. Можно говорить.' : '', this.enabled ? 'listening' : 'idle');
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
    if (src && this.reference) this.tail = { reference: this.reference, until: this.ctx.currentTime + 0.4 };
    this.playing = false;
    this.reference = null;
    this.overlap = [];
    this.overlapTime = 0;
    this.overlapQuiet = 0;
    mouth(0);
  }
  stop(cancel = true, keepOutput = false) {
    this.epoch++;
    this.enabled = false;
    this.testing = false;
    this.captureId++;
    this.turnId++;
    this.busy = false;
    this.transcribing = false;
    if (!keepOutput) {
      this.replyEpoch++;
      this.hush();
    }
    this.tail = null;
    this.reset();
    this.proc?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.onMeter?.(0, '');
    if (cancel) call('stop').catch(() => {});
    this.onStatus(this.playing ? 'Отвечаю…' : '', this.playing ? 'speaking' : 'idle');
  }
  async decode(data) {
    const ctx = await this.context();
    const b = await ctx.decodeAudioData(new Uint8Array(data).buffer);
    return wav(b.getChannelData(0), b.sampleRate);
  }
}
