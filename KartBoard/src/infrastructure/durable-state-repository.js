const { createDefaultState, migrateState } = require('../domain/state');

class DurableStateRepository {
  constructor(storage, { now = Date.now, key = 'state' } = {}) {
    this.storage = storage;
    this.now = now;
    this.key = key;
  }

  async load() {
    const raw = await this.storage.get(this.key);
    if (!raw || typeof raw !== 'object') return createDefaultState(this.now());
    return attachActor(migrateState(raw, this.now()), raw);
  }

  async save(state) {
    await this.storage.put(this.key, state);
  }
}

function attachActor(state, raw) {
  const updatedBy = typeof raw.updatedBy === 'string' ? raw.updatedBy.trim().slice(0, 60) : '';
  return updatedBy ? { ...state, updatedBy } : state;
}

module.exports = { DurableStateRepository };
