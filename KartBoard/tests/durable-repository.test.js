const test = require('node:test');
const assert = require('node:assert/strict');
const { DurableStateRepository } = require('../src/infrastructure/durable-state-repository');
const { createDefaultState } = require('../src/domain/state');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
}

test('durable storage migrates legacy state and keeps the actor', async () => {
  const storage = new MemoryStorage();
  await storage.put('state', { rotation: ['Cadet', 'Senior'], currentIndex: 0, revision: 4, updatedBy: 'Russell' });
  const repository = new DurableStateRepository(storage, { now: () => 50 });
  const loaded = await repository.load();
  assert.equal(loaded.schemaVersion, 2);
  assert.equal(loaded.revision, 4);
  assert.equal(loaded.updatedBy, 'Russell');
  assert.deepEqual(loaded.rotation.map(item => item.name), ['Cadet', 'Senior']);
  loaded.notice = 'Saved';
  await repository.save(loaded);
  const again = await new DurableStateRepository(storage, { now: () => 50 }).load();
  assert.equal(again.notice, 'Saved');
  assert.equal(again.updatedBy, 'Russell');
});

test('durable storage creates a default day when empty', async () => {
  const repository = new DurableStateRepository(new MemoryStorage(), { now: () => 50 });
  const state = await repository.load();
  assert.equal(state.status, 'ready');
  assert.equal(state.revision, createDefaultState(50).revision);
});
