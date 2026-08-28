export function rotationItems(state) {
  return (state?.rotation || []).map((item, index) => typeof item === 'string' ? { id: `legacy-${index}`, name: item } : item);
}

export function currentItem(state) {
  if (state?.currentClass && typeof state.currentClass === 'object') return state.currentClass;
  const items = rotationItems(state);
  return items[state?.currentIndex || 0] || null;
}

export function upcomingItem(state, offset = 0) {
  const items = rotationItems(state);
  if (!items.length) return null;
  const base = Number.isInteger(state?.nextIndex) ? state.nextIndex : ((state?.currentIndex || 0) + 1) % items.length;
  return items[(base + offset + items.length) % items.length];
}

export function scheduleNames(state) {
  return {
    current: currentItem(state)?.name || 'Not configured',
    next: upcomingItem(state, 0)?.name || 'Not configured',
    then: upcomingItem(state, 1)?.name || 'Not configured'
  };
}

export function remainingMs(state, now = Date.now()) {
  const duration = (state?.sessionMinutes || 9) * 60_000;
  if (state?.status === 'paused') return state.pausedRemainingMs ?? duration;
  if (state?.status !== 'running' || state.startedAt === null) return duration;
  return Math.max(0, duration - (now - state.startedAt));
}

export function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function statusCopy(state) {
  if (state.status === 'ready') return ['Ready to begin', 'Waiting for the first session'];
  if (state.status === 'paused') return ['Session paused', 'Practice is temporarily paused'];
  if (state.status === 'changeover') return ['Track changeover', `${scheduleNames(state).next} is up next`];
  if (state.status === 'break') return ['Practice break', 'Practice will resume shortly'];
  if (state.status === 'finished') return ['Practice finished', 'Thanks for a great day'];
  return ['On track', 'Approximate time remaining'];
}

export function createClassItem(name) {
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return { id: `class-${unique}`, name: String(name).trim().slice(0, 40) };
}

export function duplicateClassItem(item) {
  return createClassItem(item.name);
}

export function copyRotation(items) { return items.map(item => ({ ...item })); }
