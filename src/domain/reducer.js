const { DomainError } = require('./errors');
const { STATUSES, createDefaultState, requireRotation, getUpcoming, remainingMs } = require('./state');

const ACTIONS = Object.freeze({
  CONFIGURE: 'configure', UPDATE_ROTATION: 'updateRotation', START: 'start', NEXT: 'next', PREVIOUS: 'previous',
  PAUSE: 'pause', RESUME: 'resume', ADD_MINUTE: 'addMinute', CHANGEOVER: 'changeover', BREAK: 'break',
  FINISH: 'finish', NOTICE: 'notice', RESET: 'reset'
});
const ACTION_NAMES = Object.freeze(Object.values(ACTIONS));

function reduceState(state, action, payload = {}, now = Date.now()) {
  let next;
  switch (action) {
    case ACTIONS.CONFIGURE: next = configure(state, payload); break;
    case ACTIONS.UPDATE_ROTATION: next = updateRotation(state, payload); break;
    case ACTIONS.START: next = start(state, now); break;
    case ACTIONS.NEXT: next = advance(state, now); break;
    case ACTIONS.PREVIOUS: next = previous(state, now); break;
    case ACTIONS.PAUSE: next = pause(state, now); break;
    case ACTIONS.RESUME: next = resume(state, now); break;
    case ACTIONS.ADD_MINUTE: next = addMinute(state); break;
    case ACTIONS.CHANGEOVER: next = { ...state, status: STATUSES.CHANGEOVER, startedAt: null, pausedRemainingMs: null }; break;
    case ACTIONS.BREAK: next = { ...state, status: STATUSES.BREAK, startedAt: null, pausedRemainingMs: null }; break;
    case ACTIONS.FINISH: next = { ...state, status: STATUSES.FINISHED, startedAt: null, pausedRemainingMs: null }; break;
    case ACTIONS.NOTICE: next = { ...state, notice: cleanNotice(payload.notice) }; break;
    case ACTIONS.RESET: return createDefaultState(now);
    default: throw new DomainError('UNKNOWN_ACTION', `Unknown action: ${action || '(missing)'}`);
  }
  return { ...next, revision: state.revision + 1, updatedAt: now };
}

function configure(state, payload) {
  const rotation = requireRotation(payload.rotation);
  return {
    ...state,
    venue: cleanRequired(payload.venue, state.venue, 60), dayLabel: cleanRequired(payload.dayLabel, state.dayLabel, 60),
    sessionMinutes: clampMinutes(payload.sessionMinutes), rotation, currentClass: { ...rotation[0] }, nextIndex: rotation.length === 1 ? 0 : 1,
    status: STATUSES.READY, startedAt: null, pausedRemainingMs: null, notice: ''
  };
}

function updateRotation(state, payload) {
  const rotation = requireRotation(payload.rotation);
  const oldUpcoming = getUpcoming(state);
  const activeIndex = rotation.findIndex(item => item.id === state.currentClass?.id);
  const preservedUpcomingIndex = rotation.findIndex(item => item.id === oldUpcoming?.id);
  const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % rotation.length : preservedUpcomingIndex >= 0 ? preservedUpcomingIndex : 0;
  return { ...state, rotation, nextIndex };
}

function start(state, now) {
  requireExistingRotation(state);
  const startsNewDay = state.status === STATUSES.READY || state.status === STATUSES.FINISHED;
  const active = startsNewDay ? state.rotation[0] : state.currentClass || state.rotation[0];
  const activeIndex = state.rotation.findIndex(item => item.id === active.id);
  return { ...state, currentClass: { ...active }, nextIndex: activeIndex >= 0 ? (activeIndex + 1) % state.rotation.length : state.nextIndex, status: STATUSES.RUNNING, startedAt: now, pausedRemainingMs: null };
}

function advance(state, now) {
  requireExistingRotation(state);
  const active = state.rotation[state.nextIndex] || state.rotation[0];
  return { ...state, currentClass: { ...active }, nextIndex: (state.nextIndex + 1) % state.rotation.length, status: STATUSES.RUNNING, startedAt: now, pausedRemainingMs: null, notice: '' };
}

function previous(state, now) {
  requireExistingRotation(state);
  const activeIndex = state.rotation.findIndex(item => item.id === state.currentClass?.id);
  const previousIndex = activeIndex >= 0 ? (activeIndex - 1 + state.rotation.length) % state.rotation.length : (state.nextIndex - 1 + state.rotation.length) % state.rotation.length;
  return { ...state, currentClass: { ...state.rotation[previousIndex] }, nextIndex: (previousIndex + 1) % state.rotation.length, status: STATUSES.RUNNING, startedAt: now, pausedRemainingMs: null };
}

function pause(state, now) {
  if (state.status !== STATUSES.RUNNING) throw new DomainError('INVALID_TRANSITION', 'Only a running session can be paused.');
  return { ...state, pausedRemainingMs: remainingMs(state, now), status: STATUSES.PAUSED, startedAt: null };
}

function resume(state, now) {
  if (![STATUSES.PAUSED, STATUSES.BREAK].includes(state.status)) throw new DomainError('INVALID_TRANSITION', 'There is no paused session or break to resume.');
  const duration = state.sessionMinutes * 60_000;
  const remaining = state.pausedRemainingMs ?? duration;
  return { ...state, startedAt: now - Math.max(0, duration - remaining), pausedRemainingMs: null, status: STATUSES.RUNNING };
}

function addMinute(state) {
  if (state.status === STATUSES.PAUSED) return { ...state, pausedRemainingMs: (state.pausedRemainingMs ?? 0) + 60_000 };
  if (state.status === STATUSES.RUNNING) return { ...state, startedAt: state.startedAt + 60_000 };
  throw new DomainError('INVALID_TRANSITION', 'Start a session before adding time.');
}

function requireExistingRotation(state) { if (!state.rotation.length) throw new DomainError('EMPTY_ROTATION', 'The running order is empty.'); }
function cleanRequired(value, fallback, maxLength) { const text = value === null || value === undefined ? '' : String(value).trim(); return (text || fallback).slice(0, maxLength); }
function cleanNotice(value) { return (value === null || value === undefined ? '' : String(value).trim()).slice(0, 140); }
function clampMinutes(value) { const number = Number(value); return Number.isFinite(number) ? Math.min(30, Math.max(1, number)) : 9; }

module.exports = { ACTIONS, ACTION_NAMES, reduceState };
