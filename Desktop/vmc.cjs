const dgram = require('node:dgram');
const { performance } = require('node:perf_hooks');

function string(value) {
  const bytes = Buffer.from(value, 'utf8'),
    padded = Buffer.alloc((bytes.length + 4) & ~3);
  bytes.copy(padded);
  return padded;
}
function packet(address, types, ...values) {
  const fields = [string(address), string(',' + types)];
  for (const [index, type] of Array.from(types).entries()) {
    if (type === 's') fields.push(string(values[index]));
    else {
      const value = Buffer.alloc(4);
      if (type === 'i') value.writeInt32BE(values[index]);
      else value.writeFloatBE(values[index]);
      fields.push(value);
    }
  }
  return Buffer.concat(fields);
}
function framePackets(frame, time) {
  if (!Array.isArray(frame?.bones) || !frame.bones.length || frame.bones.length > 70)
    throw Error('Некорректная поза VMC');
  const messages = [
    packet('/VMC/Ext/OK', 'i', 1),
    packet('/VMC/Ext/T', 'f', time),
    packet('/VMC/Ext/Root/Pos', 'sfffffff', 'root', 0, 0, 0, 0, 0, 0, 1),
  ];
  for (const bone of frame.bones) {
    if (
      !Array.isArray(bone) ||
      bone.length !== 8 ||
      !/^\w{1,40}$/.test(bone[0]) ||
      !bone.slice(1).every(Number.isFinite)
    )
      throw Error('Некорректная кость');
    messages.push(packet('/VMC/Ext/Bone/Pos', 'sfffffff', ...bone));
  }
  for (const [name, value] of Object.entries(frame.face || {}).slice(0, 40)) {
    if (/^\w{1,64}$/.test(name) && Number.isFinite(value))
      messages.push(packet('/VMC/Ext/Blend/Val', 'sf', name, Math.max(0, Math.min(1, value))));
  }
  messages.push(packet('/VMC/Ext/Blend/Apply', ''));
  const bundles = [],
    header = Buffer.from('2362756e646c65000000000000000001', 'hex');
  let parts = [header],
    length = header.length;
  for (const m of messages) {
    if (length + m.length + 4 > 1200) {
      bundles.push(Buffer.concat(parts));
      parts = [header];
      length = header.length;
    }
    const size = Buffer.alloc(4);
    size.writeUInt32BE(m.length);
    parts.push(size, m);
    length += 4 + m.length;
  }
  bundles.push(Buffer.concat(parts));
  return bundles;
}
class MotionOutput {
  constructor() {
    this.port = 0;
    this.socket = null;
  }
  configure(port, onError) {
    if (port === this.port) return;
    if (port !== 0 && (!Number.isInteger(port) || port < 1 || port > 65535))
      throw Error('Укажите UDP-порт от 1 до 65535');
    this.socket?.close();
    this.socket = null;
    this.port = port;
    if (port) {
      const socket = dgram.createSocket('udp4');
      this.socket = socket;
      socket.on('error', (e) => {
        if (this.socket === socket) {
          this.configure(0);
          onError?.(e);
        }
      });
      socket.bind(0, '127.0.0.1');
    }
  }
  send(frame) {
    if (!this.socket) return;
    for (const datagram of framePackets(frame, performance.now() / 1000))
      this.socket.send(datagram, this.port, '127.0.0.1');
  }
}
module.exports = { MotionOutput, framePackets };
