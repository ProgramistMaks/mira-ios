export function address(text, name, waiting) {
  const phrase = String(text).trim(),
    tokens = phrase.match(/[\p{L}\p{N}]+/gu) || [];
  const normalized = tokens.join(' ').toLocaleLowerCase('ru');
  if (!waiting)
    return /^(?:жди обращения|перейди в режим ожидания)$/.test(normalized)
      ? { waiting: true, reply: 'Позови меня по имени.' }
      : { waiting: false, text: phrase };
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    '^(?:(?:привет|эй|слушай)[\\s,.!–—-]+)?' + escaped + '(?=$|[^\\p{L}\\p{N}])[\\s,.!?–—:-]*',
    'iu',
  ).exec(phrase);
  if (!match) return { waiting: true };
  const rest = phrase.slice(match[0].length).trim();
  return rest ? { waiting: false, text: rest } : { waiting: false, reply: 'Я слушаю.' };
}

// A bare wake word admits one utterance. Compare its onset, not the time STT finished.
export class WakeGate {
  constructor() {
    this.reset();
  }
  reset() {
    this.until = 0;
    this.armedAt = 0;
  }
  pending(at = Date.now()) {
    return this.until > 0 && at >= this.armedAt && at <= this.until;
  }
  match(text, name) {
    for (const word of new Set(['Мира', 'Mira', name].filter(Boolean))) {
      const hit = address(text, word, true);
      if (!hit.waiting) return hit;
    }
  }
  accept(text, name, startedAt = Date.now(), now = Date.now()) {
    const hit = this.match(text, name);
    if (hit && !hit.text) {
      this.armedAt = now;
      this.until = now + 10000;
      return;
    }
    const allowed = !!hit || this.pending(startedAt);
    this.reset();
    if (allowed) return hit?.text || String(text).trim() || undefined;
  }
}
