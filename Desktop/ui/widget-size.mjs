export function widgetSize(id, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return undefined;
  const minWidth = ['notes', 'tasks', 'clock'].includes(id) ? 4 : 3;
  return { width: Math.max(minWidth, Math.min(12, width)), height: Math.max(2, Math.min(10, height)) };
}
