const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDefaultState } = require('../src/domain/state');
const { FileStateRepository } = require('../src/infrastructure/file-state-repository');

function withRepository(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kartboard-test-'));
  const file = path.join(directory, 'state.json');
  const repository = new FileStateRepository(file, { logger: { warn() {} }, now: () => 100 });
  try { run({ repository, file }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('persists schema-v2 state and keeps a prior backup', () => withRepository(({ repository, file }) => {
  const first = createDefaultState(100);
  repository.save(first);
  repository.save({ ...first, revision: 1, notice: 'Second write' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).notice, 'Second write');
  assert.equal(JSON.parse(fs.readFileSync(`${file}.backup`, 'utf8')).notice, '');
}));

test('keeps the controller who last changed the day', () => withRepository(({ repository, file }) => {
  const state = { ...createDefaultState(100), updatedBy: 'Russell' };
  repository.save(state);
  assert.equal(repository.load().updatedBy, 'Russell');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).updatedBy, 'Russell');
}));

test('recovers from backup when primary JSON is corrupt', () => withRepository(({ repository, file }) => {
  const state = createDefaultState(100);
  repository.save(state);
  repository.save({ ...state, revision: 1 });
  fs.writeFileSync(file, '{not-json', 'utf8');
  const recovered = repository.load();
  assert.equal(recovered.schemaVersion, 2);
  assert.equal(recovered.revision, 0);
}));
