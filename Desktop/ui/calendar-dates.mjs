export const calendarStart = (event) => event.startTime ?? event.time;
export function localKey(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
// Compare local calendar days. A weekly meeting retains its weekday across daylight-saving changes.
export function occursOn(event, day) {
  if (event.category === 'reminder') return false;
  const start = new Date(calendarStart(event));
  const delta =
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) -
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  if (delta === 0) return true;
  if (delta < 0) return false;
  return event.repeat === 'day' || (event.repeat === 'week' && delta % (7 * 86400000) === 0);
}
