export const SCHEMA_VERSION = 2;
export const API_VERSION = 3;
export const ACTION_NAMES = [
  'configure', 'updateRotation', 'start', 'next', 'previous', 'pause',
  'resume', 'addMinute', 'changeover', 'break', 'finish', 'notice', 'reset',
] as const;

export type Status = 'ready' | 'running' | 'paused' | 'changeover' | 'break' | 'finished';
export type ClassItem = { id: string; name: string };

export type KartBoardState = {
  schemaVersion: number;
  revision: number;
  venue: string;
  dayLabel: string;
  sessionMinutes: number;
  rotation: ClassItem[];
  currentClass: ClassItem;
  nextIndex: number;
  status: Status;
  startedAt: number | null;
  pausedRemainingMs: number | null;
  notice: string;
  updatedAt: number;
};

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'DomainError';
  }
}

const DEFAULT_CLASS_NAMES = ['Cadet P', 'Cadet', 'Junior P', 'Junior', 'Senior Restricted', 'Senior Open'];
const ALLOWED_STATUSES = new Set<Status>(['ready', 'running', 'paused', 'changeover', 'break', 'finished']);
const MAX_CLASSES = 30;

export function createDefaultState(now = Date.now()): KartBoardState {
  const rotation = DEFAULT_CLASS_NAMES.map((name, index) => ({ id: `default-${index + 1}`, name }));
  return {
    schemaVersion: SCHEMA_VERSION, revision: 0, venue: 'Ipswich Kart Club', dayLabel: 'Saturday Practice', sessionMinutes: 9,
    rotation, currentClass: { ...rotation[0] }, nextIndex: 1, status: 'ready',
    startedAt: null, pausedRemainingMs: null, notice: '', updatedAt: now,
  };
}

export function migrateState(input: unknown, now = Date.now()): KartBoardState {
  if (!input || typeof input !== 'object') return createDefaultState(now);
  const value = input as Partial<KartBoardState> & { currentIndex?: number };
  const rotation = normalizeRotation(value.rotation);
  if (!rotation.length) return createDefaultState(now);
  const currentClass = normalizeCurrentClass(value.currentClass, rotation, value.currentIndex);
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: nonNegativeInteger(value.revision, 0),
    venue: cleanText(value.venue, 'Ipswich Kart Club', 60),
    dayLabel: cleanText(value.dayLabel, 'Saturday Practice', 60),
    sessionMinutes: clampNumber(value.sessionMinutes, 1, 30, 9),
    rotation,
    currentClass,
    nextIndex: normalizeIndex(value.nextIndex, rotation.length, nextAfterCurrent(rotation, currentClass)),
    status: ALLOWED_STATUSES.has(value.status as Status) ? value.status as Status : 'ready',
    startedAt: nullableNumber(value.startedAt),
    pausedRemainingMs: nullableNonNegativeNumber(value.pausedRemainingMs),
    notice: cleanText(value.notice, '', 140, true),
    updatedAt: finiteNumber(value.updatedAt, now),
  };
}

export function reduceState(state: KartBoardState, action: unknown, payload: Record<string, unknown> = {}, now = Date.now()): KartBoardState {
  let next: KartBoardState;
  switch (action) {
    case 'configure': next = configure(state, payload); break;
    case 'updateRotation': next = updateRotation(state, payload); break;
    case 'start': next = start(state, now); break;
    case 'next': next = advance(state, now); break;
    case 'previous': next = previous(state, now); break;
    case 'pause': next = pause(state, now); break;
    case 'resume': next = resume(state, now); break;
    case 'addMinute': next = addMinute(state); break;
    case 'changeover': next = { ...state, status: 'changeover', startedAt: null, pausedRemainingMs: null }; break;
    case 'break': next = { ...state, status: 'break', startedAt: null, pausedRemainingMs: null }; break;
    case 'finish': next = { ...state, status: 'finished', startedAt: null, pausedRemainingMs: null }; break;
    case 'notice': next = { ...state, notice: cleanText(payload.notice, '', 140, true) }; break;
    case 'reset': next = createDefaultState(now); break;
    default: throw new DomainError('UNKNOWN_ACTION', `Unknown action: ${String(action || '(missing)')}`);
  }
  return { ...next, revision: state.revision + 1, updatedAt: now };
}

export function toPublicState(state: KartBoardState) {
  return { ...state, currentIndex: state.rotation.findIndex(item => item.id === state.currentClass?.id) };
}

function configure(state: KartBoardState, payload: Record<string, unknown>): KartBoardState {
  const rotation = requireRotation(payload.rotation);
  return {
    ...state,
    venue: cleanText(payload.venue, state.venue, 60),
    dayLabel: cleanText(payload.dayLabel, state.dayLabel, 60),
    sessionMinutes: clampNumber(payload.sessionMinutes, 1, 30, 9),
    rotation,
    currentClass: { ...rotation[0] },
    nextIndex: rotation.length === 1 ? 0 : 1,
    status: 'ready', startedAt: null, pausedRemainingMs: null, notice: '',
  };
}

function updateRotation(state: KartBoardState, payload: Record<string, unknown>): KartBoardState {
  const rotation = requireRotation(payload.rotation);
  const oldUpcoming = getUpcoming(state);
  const activeIndex = rotation.findIndex(item => item.id === state.currentClass?.id);
  const preservedUpcomingIndex = rotation.findIndex(item => item.id === oldUpcoming?.id);
  const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % rotation.length : preservedUpcomingIndex >= 0 ? preservedUpcomingIndex : 0;
  return { ...state, rotation, nextIndex };
}

function start(state: KartBoardState, now: number): KartBoardState {
  requireExistingRotation(state);
  const startsNewDay = state.status === 'ready' || state.status === 'finished';
  const active = startsNewDay ? state.rotation[0] : state.currentClass || state.rotation[0];
  const activeIndex = state.rotation.findIndex(item => item.id === active.id);
  return { ...state, currentClass: { ...active }, nextIndex: activeIndex >= 0 ? (activeIndex + 1) % state.rotation.length : state.nextIndex, status: 'running', startedAt: now, pausedRemainingMs: null };
}

function advance(state: KartBoardState, now: number): KartBoardState {
  requireExistingRotation(state);
  const active = state.rotation[state.nextIndex] || state.rotation[0];
  return { ...state, currentClass: { ...active }, nextIndex: (state.nextIndex + 1) % state.rotation.length, status: 'running', startedAt: now, pausedRemainingMs: null, notice: '' };
}

function previous(state: KartBoardState, now: number): KartBoardState {
  requireExistingRotation(state);
  const activeIndex = state.rotation.findIndex(item => item.id === state.currentClass?.id);
  const previousIndex = activeIndex >= 0 ? (activeIndex - 1 + state.rotation.length) % state.rotation.length : (state.nextIndex - 1 + state.rotation.length) % state.rotation.length;
  return { ...state, currentClass: { ...state.rotation[previousIndex] }, nextIndex: (previousIndex + 1) % state.rotation.length, status: 'running', startedAt: now, pausedRemainingMs: null };
}

function pause(state: KartBoardState, now: number): KartBoardState {
  if (state.status !== 'running') throw new DomainError('INVALID_TRANSITION', 'Only a running session can be paused.');
  return { ...state, pausedRemainingMs: remainingMs(state, now), status: 'paused', startedAt: null };
}

function resume(state: KartBoardState, now: number): KartBoardState {
  if (!['paused', 'break'].includes(state.status)) throw new DomainError('INVALID_TRANSITION', 'There is no paused session or break to resume.');
  const duration = state.sessionMinutes * 60_000;
  const remaining = state.pausedRemainingMs ?? duration;
  return { ...state, startedAt: now - Math.max(0, duration - remaining), pausedRemainingMs: null, status: 'running' };
}

function addMinute(state: KartBoardState): KartBoardState {
  if (state.status === 'paused') return { ...state, pausedRemainingMs: (state.pausedRemainingMs ?? 0) + 60_000 };
  if (state.status === 'running') return { ...state, startedAt: (state.startedAt ?? Date.now()) + 60_000 };
  throw new DomainError('INVALID_TRANSITION', 'Start a session before adding time.');
}

function remainingMs(state: KartBoardState, now: number) {
  const duration = state.sessionMinutes * 60_000;
  if (state.status === 'paused') return state.pausedRemainingMs ?? duration;
  if (state.status !== 'running' || state.startedAt === null) return duration;
  return Math.max(0, duration - (now - state.startedAt));
}

function getUpcoming(state: KartBoardState) { return state.rotation.length ? state.rotation[state.nextIndex % state.rotation.length] : null; }

function requireRotation(value: unknown) {
  const rotation = normalizeRotation(value);
  if (!rotation.length) throw new DomainError('EMPTY_ROTATION', 'Add at least one class to the running order.');
  return rotation;
}

function normalizeRotation(value: unknown): ClassItem[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  const rotation: ClassItem[] = [];
  for (const item of value.slice(0, MAX_CLASSES)) {
    const record = item && typeof item === 'object' ? item as Partial<ClassItem> : { name: item };
    const name = cleanText(record.name, '', 40, true);
    if (!name) continue;
    let id = cleanId(record.id);
    if (!id || usedIds.has(id)) id = `class-${crypto.randomUUID()}`;
    usedIds.add(id);
    rotation.push({ id, name });
  }
  return rotation;
}

function normalizeCurrentClass(value: unknown, rotation: ClassItem[], legacyIndex?: number) {
  if (value && typeof value === 'object') {
    const record = value as Partial<ClassItem>;
    const id = cleanId(record.id);
    const name = cleanText(record.name, '', 40, true);
    if (id && name) return { id, name };
  }
  return { ...(rotation[normalizeIndex(legacyIndex, rotation.length, 0)] || rotation[0]) };
}

function requireExistingRotation(state: KartBoardState) { if (!state.rotation.length) throw new DomainError('EMPTY_ROTATION', 'The running order is empty.'); }
function nextAfterCurrent(rotation: ClassItem[], currentClass: ClassItem) { const index = rotation.findIndex(item => item.id === currentClass?.id); return index >= 0 ? (index + 1) % rotation.length : 0; }
function cleanText(value: unknown, fallback: string, maxLength: number, allowEmpty = false) { const text = value === null || value === undefined ? '' : String(value).trim(); if (!text) return allowEmpty ? '' : fallback; return text.slice(0, maxLength); }
function cleanId(value: unknown) { const id = value === null || value === undefined ? '' : String(value).trim(); return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : ''; }
function clampNumber(value: unknown, min: number, max: number, fallback: number) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function finiteNumber(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function nullableNumber(value: unknown) { if (value === null || value === undefined || value === '') return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function nullableNonNegativeNumber(value: unknown) { const number = nullableNumber(value); return number === null ? null : Math.max(0, number); }
function nonNegativeInteger(value: unknown, fallback: number) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : fallback; }
function normalizeIndex(value: unknown, length: number, fallback = 0) { if (!length) return 0; const number = Number(value); return Number.isInteger(number) && number >= 0 && number < length ? number : fallback % length; }
