const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultState, migrateState, remainingMs } = require('../src/domain/state');

test('creates a valid default state', () => {
  const state = createDefaultState(1000);
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.status, 'ready');
  assert.equal(state.currentClass.id, state.rotation[0].id);
  assert.equal(state.nextIndex, 1);
  assert.equal(state.startedAt, null);
});

test('migrates legacy string rotations without losing the active class', () => {
  const state = migrateState({
    venue: 'Test Track', dayLabel: 'Practice', sessionMinutes: 8,
    rotation: ['Cadet', 'Senior', 'Cadet'], currentIndex: 1, currentClass: 'Senior',
    status: 'running', startedAt: 500, pausedRemainingMs: null, updatedAt: 600
  }, 1000);
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.rotation.map(item => item.name), ['Cadet', 'Senior', 'Cadet']);
  assert.equal(new Set(state.rotation.map(item => item.id)).size, 3);
  assert.equal(state.currentClass.name, 'Senior');
  assert.equal(state.nextIndex, 2);
  assert.equal(state.startedAt, 500);
  assert.equal(state.pausedRemainingMs, null);
});

test('normalization preserves null timestamps', () => {
  const state = migrateState({ ...createDefaultState(100), startedAt: null, pausedRemainingMs: null }, 200);
  assert.equal(state.startedAt, null);
  assert.equal(state.pausedRemainingMs, null);
});

test('computes remaining time for running and paused sessions', () => {
  const running = { ...createDefaultState(0), status: 'running', sessionMinutes: 9, startedAt: 1_000 };
  assert.equal(remainingMs(running, 61_000), 480_000);
  assert.equal(remainingMs({ ...running, status: 'paused', startedAt: null, pausedRemainingMs: 123_000 }, 99_000), 123_000);
});
