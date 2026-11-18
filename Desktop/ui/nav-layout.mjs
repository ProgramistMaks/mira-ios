export const defaultTabs = ['home', 'commands', 'model', 'voice', 'ai', 'plugins', 'settings'];
export const availableTabs = [...defaultTabs, 'desk'];
export function pinnedTabs(value) {
  if (!Array.isArray(value)) return [...defaultTabs];
  return ['home', ...new Set(value.filter((id) => id !== 'home' && availableTabs.includes(id)))];
}
