const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { revise } = require('../chat-revision.cjs');
function fixture() {
  const user = { role: 'user', id: 'a', text: 'Начало', attachments: [{ id: 'old.jpg', kind: 'image' }] };
  return {
    id: 'chat',
    title: 'Начало',
    messages: [
      user,
      { role: 'assistant', id: 'b', text: 'Ответ', generated: true },
      { role: 'user', id: 'c', text: 'Дальше', attachments: [{ kind: 'image', id: 'later.jpg' }] },
      { role: 'assistant', id: 'd', text: 'Ещё', generated: true },
    ],
  };
}
test('editing an earlier turn keeps its attachments and only drops the old branch after successful generation', async () => {
  const chat = fixture(),
    before = chat.messages;
  let saved = 0;
  await revise(
    chat,
    { last: 'd', target: 'a', text: 'Уточнение' },
    async (c, p) => {
      assert.equal(c.messages.length, 1);
      assert.equal(p, 'Уточнение');
      assert.deepEqual(c.messages[0].attachments, before[0].attachments);
      assert.equal(chat.messages, before);
      return { text: 'Новый ответ' };
    },
    () => saved++,
    async (items) => assert.deepEqual(items, before[2].attachments),
    new AbortController().signal,
  );
  assert.equal(saved, 1);
  assert.equal(chat.title, 'Уточнение');
  assert.equal(chat.messages.length, 2);
  assert.notEqual(chat.messages[0].id, 'a');
  assert.equal(chat.messages[1].text, 'Новый ответ');
  await assert.rejects(revise(chat, { target: 'a', last: 'd' }), /изменился/);
});
test('cancellation, a generation error and a write failure preserve the existing branch', async () => {
  for (const stage of ['cancel', 'model', 'save']) {
    const chat = fixture(),
      before = structuredClone(chat),
      control = new AbortController();
    await assert.rejects(
      revise(
        chat,
        { last: 'd', target: 'b' },
        async () => {
          if (stage === 'cancel') control.abort();
          if (stage === 'model') throw Error('offline');
          return { text: 'Замена' };
        },
        () => {
          if (stage === 'save') throw Error('disk');
        },
        async () => assert.fail('must retain images'),
        control.signal,
      ),
    );
    assert.deepEqual(chat, before);
  }
});
test('an action cannot be rerun by regenerating its reply', async () => {
  const chat = fixture();
  chat.messages[1].generated = false;
  await assert.rejects(
    revise(chat, { last: 'd', target: 'b' }, () => assert.fail('should not generate')),
    /моделью/,
  );
});
