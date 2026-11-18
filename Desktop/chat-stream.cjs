// Both supported APIs send UTF-8 SSE. Blank lines delimit events, not network
// chunks. A truncated response must not replace a previously saved reply.
async function streamText(response, provider, onText, signal) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = '',
    lines = [],
    value = '',
    done = false,
    finished = false,
    eventSize = 0;
  function flush() {
    const data = lines.join('\n');
    lines = [];
    eventSize = 0;
    if (!data.trim()) return;
    if (data.trim() === '[DONE]') {
      done = true;
      return;
    }
    const msg = JSON.parse(data);
    if (msg.error || msg.type === 'error')
      throw Error(String(msg.error?.message || 'Ошибка потока ответа').slice(0, 500));
    if (provider === 'anthropic' && msg.type === 'message_stop') {
      done = true;
      return;
    }
    if (provider === 'openai' && msg.choices?.[0]?.finish_reason) finished = true;
    const text =
      provider === 'anthropic'
        ? msg.type === 'content_block_delta' && msg.delta?.type === 'text_delta'
          ? msg.delta.text
          : ''
        : msg.choices?.[0]?.delta?.content;
    if (typeof text === 'string' && text) {
      if (value.length + text.length > 1000000) throw Error('Ответ модели слишком большой');
      value += text;
      onText(value);
    }
  }
  function line(s) {
    if (!s) {
      flush();
      return;
    }
    if (!s.startsWith('data:')) return;
    const content = s.slice(5).replace(/^ /, '');
    eventSize += content.length;
    if (eventSize > 2200000) throw Error('Событие модели слишком большое');
    lines.push(content);
  }
  try {
    while (!done) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let end;
      while (!done && (end = pending.indexOf('\n')) !== -1) {
        line(pending.slice(0, end).replace(/\r$/, ''));
        pending = pending.slice(end + 1);
      }
      if (pending.length > 2200000) throw Error('Событие модели слишком большое');
      if (chunk.done) {
        if (!done && pending) line(pending.replace(/\r$/, ''));
        if (!done) flush();
        break;
      }
    }
    if (!done && !finished) throw Error('Соединение с моделью прервалось до конца ответа');
    if (!value.trim()) throw Error('Модель вернула пустой ответ');
    return value.trim();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
module.exports = { streamText };
