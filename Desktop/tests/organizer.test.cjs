const test = require('node:test');
const assert = require('node:assert/strict');
const { noteDocument, noteText, noteLabel, sortedNotes, taskListOf } = require('../ui/note-format.mjs');

test('note content preserves nested formatting and text for speech, rejecting unsupported nodes and extra attributes', () => {
  const rich = noteDocument([
    { tag: 'h2', children: ['План'] },
    {
      tag: 'ol',
      children: [
        { tag: 'li', children: [{ tag: 'strong', children: ['Купить хлеб'], onclick: 'test' }] },
        { tag: 'li', children: ['Проверить почту'] },
      ],
    },
    { tag: 'blockquote', children: ['Ответить', { tag: 'br', children: [] }, 'утром'] },
  ]);
  assert.equal(noteText(rich), 'План\nКупить хлеб\nПроверить почту\nОтветить\nутром');
  assert.deepEqual(rich[1].children[0].children[0], { tag: 'b', children: ['Купить хлеб'] });
  assert.throws(() => noteDocument([{ tag: 'iframe', children: [] }]));
  assert.throws(() => noteDocument(['x'.repeat(10001)]));
});
test('plain legacy notes and ungrouped tasks open in their original order and in the default list', () => {
  const notes = [{ text: 'Раньше\nВторая строка' }, { title: 'Наверх', pinned: true }, { text: '' }];
  assert.deepEqual(sortedNotes(notes).map(noteLabel), ['Наверх', 'Раньше', 'Пустая заметка…']);
  assert.equal(taskListOf({ text: 'Старая задача' }), 'main');
});
test('calendar dates stay visible after notification, and recurring events retain their original date', () => {
  const { calendarTiming } = require('../planner.cjs');
  const { occursOn } = require('../ui/calendar-dates.mjs');
  const start = new Date(2026, 9, 21, 10).getTime();
  const now = new Date(2026, 10, 18, 11).getTime();
  const recurring = { ...calendarTiming(start, 'week', now), repeat: 'week', category: 'calendar' };
  assert.ok(recurring.time > now);
  assert.equal(recurring.fired, false);
  assert.ok(occursOn(recurring, new Date(2026, 10, 18)));
  assert.ok(occursOn(recurring, new Date(2026, 10, 25)));
  assert.equal(occursOn(recurring, new Date(2026, 10, 19)), false);
  assert.equal(occursOn(recurring, new Date(2026, 9, 14)), false);
  const past = calendarTiming(start, '', now);
  assert.equal(past.fired, true);
  assert.ok(occursOn(past, new Date(start)));
  assert.equal(occursOn({ ...past, category: 'reminder' }, new Date(start)), false);
});
