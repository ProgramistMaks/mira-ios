const { randomUUID } = require('node:crypto');
const { canRevise } = require('./ui/chat-history.mjs');
async function revise(chat, { target, last, text }, generate, save, remove, signal) {
  if (!chat || chat.messages.at(-1)?.id !== last)
    throw Error('Разговор изменился. Открой сообщение ещё раз.');
  const before = chat.messages,
    title = chat.title,
    index = before.findIndex((m) => m.id === target);
  if (index < 0) throw Error('Сообщение уже изменилось');
  const editing = before[index].role === 'user',
    userIndex = editing ? index : index - 1;
  const user = before[userIndex],
    reply = before[userIndex + 1];
  if (user?.role !== 'user' || !canRevise(reply)) throw Error('Можно изменить только разговор с моделью');
  const prompt = editing ? String(text || '').trim() : user.text;
  if (!prompt || prompt.length > 45000) throw Error('Введите от 1 до 45 000 знаков');
  const kept = before.slice(0, userIndex);
  kept.push(editing ? { ...user, id: randomUUID(), text: prompt, time: Date.now() } : user);
  const answer = await generate({ ...chat, messages: kept }, prompt);
  signal.throwIfAborted();
  if (chat.messages !== before || chat.messages.at(-1)?.id !== last) throw Error('Разговор изменился');
  chat.messages = [
    ...kept,
    { role: 'assistant', text: answer.text, generated: true, id: randomUUID(), time: Date.now() },
  ];
  if (!userIndex && editing) chat.title = prompt.slice(0, 48);
  try {
    save();
  } catch (e) {
    chat.messages = before;
    chat.title = title;
    throw e;
  }
  await remove(before.slice(userIndex + 1).flatMap((m) => m.attachments || []));
  return answer.text;
}
module.exports = { revise };
