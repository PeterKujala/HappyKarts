const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createDefaultState } = require('../src/domain/state');
const { createKartBoardServer } = require('../src/http/create-server');

class MemoryRepository {
  constructor() { this.state = createDefaultState(100); }
  load() { return this.state; }
  save(state) { this.state = structuredClone(state); }
}

async function withServer(run) {
  const app = createKartBoardServer({ publicDir: path.join(__dirname, '..', 'public'), repository: new MemoryRepository(), now: () => 1_000, logger: { error() {}, warn() {} } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await app.close(); }
}

async function post(base, body) {
  return fetch(`${base}/api/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('exposes version metadata and state', () => withServer(async base => {
  const meta = await fetch(`${base}/api/meta`).then(response => response.json());
  assert.equal(meta.apiVersion, 2);
  assert.ok(meta.actions.includes('updateRotation'));
  const state = await fetch(`${base}/api/state`).then(response => response.json());
  assert.equal(state.schemaVersion, 2);
}));

test('updates state and returns structured errors', () => withServer(async base => {
  let response = await post(base, { action: 'start' });
  assert.equal(response.status, 200);
  let state = await response.json();
  assert.equal(state.status, 'running');
  response = await post(base, { action: 'unknown' });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'UNKNOWN_ACTION');
}));

test('rejects stale controller revisions', () => withServer(async base => {
  const initial = await fetch(`${base}/api/state`).then(response => response.json());
  await post(base, { action: 'notice', payload: { notice: 'First' }, expectedRevision: initial.revision });
  const conflict = await post(base, { action: 'updateRotation', payload: { rotation: initial.rotation }, expectedRevision: initial.revision });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, 'REVISION_CONFLICT');
}));

test('serves app files and blocks traversal', () => withServer(async base => {
  assert.equal((await fetch(`${base}/control.html`)).status, 200);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
}));
