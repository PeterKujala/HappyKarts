const { randomUUID } = require('crypto');
const { DomainError } = require('./errors');

const SCHEMA_VERSION = 2;
const MAX_CLASSES = 30;
const STATUSES = Object.freeze({ READY: 'ready', RUNNING: 'running', PAUSED: 'paused', CHANGEOVER: 'changeover', BREAK: 'break', FINISHED: 'finished' });
const ALLOWED_STATUSES = new Set(Object.values(STATUSES));
const DEFAULT_CLASS_NAMES = Object.freeze(['Cadet P', 'Cadet', 'Junior P', 'Junior', 'Senior Restricted', 'Senior Open']);

function createDefaultState(now = Date.now()) {
  const rotation = DEFAULT_CLASS_NAMES.map((name, index) => ({ id: `default-${index + 1}`, name }));
  return {
    schemaVersion: SCHEMA_VERSION, revision: 0, venue: 'Ipswich Kart Club', dayLabel: 'Saturday Practice', sessionMinutes: 9,
    rotation, currentClass: { ...rotation[0] }, nextIndex: 1, status: STATUSES.READY,
    startedAt: null, pausedRemainingMs: null, notice: '', updatedAt: now
  };
}

function migrateState(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return createDefaultState(now);
  return input.schemaVersion === SCHEMA_VERSION ? normalizeV2State(input, now) : migrateLegacyState(input, now);
}

function normalizeV2State(input, now) {
  const rotation = normalizeRotation(input.rotation);
  if (!rotation.length) return createDefaultState(now);
  const currentClass = normalizeCurrentClass(input.currentClass, rotation, input.currentIndex);
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: nonNegativeInteger(input.revision, 0),
    venue: cleanText(input.venue, 'Ipswich Kart Club', 60),
    dayLabel: cleanText(input.dayLabel, 'Saturday Practice', 60),
    sessionMinutes: clampNumber(input.sessionMinutes, 1, 30, 9),
    rotation,
    currentClass,
    nextIndex: normalizeIndex(input.nextIndex, rotation.length, nextAfterCurrent(rotation, currentClass)),
    status: ALLOWED_STATUSES.has(input.status) ? input.status : STATUSES.READY,
    startedAt: nullableNumber(input.startedAt),
    pausedRemainingMs: nullableNonNegativeNumber(input.pausedRemainingMs),
    notice: cleanText(input.notice, '', 140, true),
    updatedAt: finiteNumber(input.updatedAt, now)
  };
}

function migrateLegacyState(input, now) {
  const legacyRotation = Array.isArray(input.rotation) ? input.rotation : DEFAULT_CLASS_NAMES;
  const rotation = normalizeRotation(legacyRotation, { deterministic: true });
  if (!rotation.length) return createDefaultState(now);
  const legacyIndex = normalizeIndex(input.currentIndex, rotation.length, 0);
  const requestedName = typeof input.currentClass === 'string' ? input.currentClass.trim() : '';
  const currentClass = { ...(rotation.find(item => item.name === requestedName) || rotation[legacyIndex] || rotation[0]) };
  return normalizeV2State({ ...input, schemaVersion: SCHEMA_VERSION, revision: nonNegativeInteger(input.revision, 0), rotation, currentClass, nextIndex: (legacyIndex + 1) % rotation.length, updatedAt: finiteNumber(input.updatedAt, now) }, now);
}

function normalizeRotation(input, options = {}) {
  if (!Array.isArray(input)) return [];
  const usedIds = new Set();
  const rotation = [];
  for (const [index, value] of input.slice(0, MAX_CLASSES).entries()) {
    const name = cleanText(typeof value === 'object' ? value?.name : value, '', 40, true);
    if (!name) continue;
    let id = cleanId(typeof value === 'object' ? value?.id : '');
    if (!id || usedIds.has(id)) id = options.deterministic ? legacyId(name, index) : `class-${randomUUID()}`;
    while (usedIds.has(id)) id = `class-${randomUUID()}`;
    usedIds.add(id);
    rotation.push({ id, name });
  }
  return rotation;
}

function requireRotation(input) {
  const rotation = normalizeRotation(input);
  if (!rotation.length) throw new DomainError('EMPTY_ROTATION', 'Add at least one class to the running order.');
  return rotation;
}

function normalizeCurrentClass(value, rotation, legacyIndex) {
  if (value && typeof value === 'object') {
    const id = cleanId(value.id);
    const name = cleanText(value.name, '', 40, true);
    if (id && name) return { id, name };
  }
  if (typeof value === 'string' && value.trim()) return { ...(rotation.find(item => item.name === value.trim()) || rotation[0]) };
  return { ...(rotation[normalizeIndex(legacyIndex, rotation.length, 0)] || rotation[0]) };
}

function getCurrentIndex(state) { return state.rotation.findIndex(item => item.id === state.currentClass?.id); }
function getUpcoming(state, offset = 0) { return state.rotation.length ? state.rotation[(state.nextIndex + offset + state.rotation.length) % state.rotation.length] : null; }
function remainingMs(state, now = Date.now()) {
  const duration = state.sessionMinutes * 60_000;
  if (state.status === STATUSES.PAUSED) return state.pausedRemainingMs ?? duration;
  if (state.status !== STATUSES.RUNNING || state.startedAt === null) return duration;
  return Math.max(0, duration - (now - state.startedAt));
}
function toPublicState(state) { return { ...state, currentIndex: getCurrentIndex(state) }; }
function nextAfterCurrent(rotation, currentClass) { const index = rotation.findIndex(item => item.id === currentClass?.id); return index >= 0 ? (index + 1) % rotation.length : 0; }
function normalizeIndex(value, length, fallback = 0) { if (!length) return 0; const number = Number(value); return Number.isInteger(number) && number >= 0 && number < length ? number : fallback % length; }
function cleanText(value, fallback, maxLength, allowEmpty = false) { const text = value === null || value === undefined ? '' : String(value).trim(); if (!text) return allowEmpty ? '' : fallback; return text.slice(0, maxLength); }
function cleanId(value) { const id = value === null || value === undefined ? '' : String(value).trim(); return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : ''; }
function legacyId(name, index) { const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'class'; return `legacy-${slug}-${index + 1}`; }
function clampNumber(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function finiteNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function nullableNumber(value) { if (value === null || value === undefined || value === '') return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function nullableNonNegativeNumber(value) { const number = nullableNumber(value); return number === null ? null : Math.max(0, number); }
function nonNegativeInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : fallback; }

module.exports = { SCHEMA_VERSION, STATUSES, DEFAULT_CLASS_NAMES, createDefaultState, migrateState, normalizeRotation, requireRotation, getCurrentIndex, getUpcoming, remainingMs, toPublicState };
