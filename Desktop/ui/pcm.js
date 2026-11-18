class MicrophonePCM extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input?.length) {
      if (!this.buf) {
        this.buf = new Float32Array(2048);
        this.pos = 0;
      }
      let offset = 0;
      while (offset < input.length) {
        const n = Math.min(input.length - offset, this.buf.length - this.pos);
        this.buf.set(input.subarray(offset, offset + n), this.pos);
        this.pos += n;
        offset += n;
        if (this.pos === this.buf.length) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(2048);
          this.pos = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('mira-pcm', MicrophonePCM);
