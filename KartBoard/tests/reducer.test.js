const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultState, getUpcoming } = require('../src/domain/state');
const { reduceState } = require('../src/domain/reducer');

function classes(...names) { return names.map((name, index) => ({ id: `id-${index + 1}`, name })); }

test('configures and starts a practice day', () => {
  let state = reduceState(createDefaultState(0), 'configure', { venue: 'Test', dayLabel: 'Sunday', sessionMinutes: 8, rotation: classes('Cadet', 'Senior') }, 100);
  assert.equal(state.status, 'ready');
  assert.equal(state.currentClass.name, 'Cadet');
  state = reduceState(state, 'start', {}, 200);
  assert.equal(state.status, 'running');
  assert.equal(state.startedAt, 200);
  assert.equal(getUpcoming(state).name, 'Senior');
});

test('rotation changes preserve the active session and timer', () => {
  let state = reduceState(createDefaultState(0), 'configure', { rotation: classes('Cadet', 'Senior', '4SS') }, 100);
  state = reduceState(state, 'start', {}, 200);
  const active = state.currentClass;
  state = reduceState(state, 'updateRotation', { rotation: [state.rotation[0], state.rotation[2], state.rotation[1]] }, 300);
  assert.deepEqual(state.currentClass, active);
  assert.equal(state.startedAt, 200);
  assert.equal(state.status, 'running');
  assert.equal(getUpcoming(state).name, '4SS');
});

test('removing the active class affects only future rotation', () => {
  let state = reduceState(createDefaultState(0), 'configure', { rotation: classes('Cadet', 'Senior', '4SS') }, 100);
  state = reduceState(state, 'start', {}, 200);
  const active = state.currentClass;
  const upcoming = getUpcoming(state);
  state = reduceState(state, 'updateRotation', { rotation: state.rotation.slice(1) }, 300);
  assert.deepEqual(state.currentClass, active);
  assert.equal(state.rotation.some(item => item.id === active.id), false);
  assert.equal(getUpcoming(state).id, upcoming.id);
  assert.equal(state.startedAt, 200);
});

test('stable IDs disambiguate duplicate class names', () => {
  let state = reduceState(createDefaultState(0), 'configure', { rotation: classes('Cadet', 'Cadet', 'Senior') }, 100);
  state = reduceState(state, 'start', {}, 200);
  state = reduceState(state, 'next', {}, 300);
  assert.equal(state.currentClass.id, 'id-2');
  assert.equal(getUpcoming(state).id, 'id-3');
});

test('pause and resume preserve elapsed time', () => {
  let state = reduceState(createDefaultState(0), 'start', {}, 1_000);
  state = reduceState(state, 'pause', {}, 61_000);
  assert.equal(state.pausedRemainingMs, 480_000);
  state = reduceState(state, 'resume', {}, 101_000);
  assert.equal(state.startedAt, 41_000);
});

test('advance minute brings a running session forward and stops at zero', () => {
  let state = reduceState(createDefaultState(0), 'start', {}, 10_000);
  state = reduceState(state, 'advanceMinute', {}, 10_000);
  assert.equal(state.startedAt, 10_000 - 60_000);
  state = reduceState(state, 'addMinute', {}, 10_000);
  assert.equal(state.startedAt, 10_000);
  const duration = state.sessionMinutes * 60_000;
  state = reduceState(state, 'advanceMinute', {}, 10_000 + duration);
  assert.equal(state.startedAt, 10_000);
});

test('advance minute shortens a paused session and rejects a day that has not started', () => {
  let state = reduceState(createDefaultState(0), 'start', {}, 1_000);
  state = reduceState(state, 'pause', {}, 61_000);
  const remaining = state.pausedRemainingMs;
  state = reduceState(state, 'advanceMinute', {}, 61_000);
  assert.equal(state.pausedRemainingMs, remaining - 60_000);
  assert.throws(() => reduceState(createDefaultState(0), 'advanceMinute', {}, 1), error => /** @type {{ code?: string }} */ (error).code === 'INVALID_TRANSITION');
});

test('rejects invalid actions and transitions', () => {
  const state = createDefaultState(0);
  assert.throws(() => reduceState(state, 'not-real', {}, 1), error => /** @type {{ code?: string }} */ (error).code === 'UNKNOWN_ACTION');
  assert.throws(() => reduceState(state, 'pause', {}, 1), error => /** @type {{ code?: string }} */ (error).code === 'INVALID_TRANSITION');
  assert.throws(() => reduceState(state, 'configure', { rotation: [] }, 1), error => /** @type {{ code?: string }} */ (error).code === 'EMPTY_ROTATION');
});
