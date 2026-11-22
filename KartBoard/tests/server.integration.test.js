const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createDefaultState } = require('../src/domain/state');
const { createKartBoardServer } = require('../src/http/create-server');
const { controllerUser, mutationHeaders } = require('./helpers');

class MemoryRepository {
  constructor() { this.state = createDefaultState(100); }
  load() { return this.state; }
  save(state) { this.state = structuredClone(state); }
}

async function withServer(run) {
  const user = await controllerUser();
  const app = createKartBoardServer({
    publicDir: path.join(__dirname, '..', 'public'),
    repository: new MemoryRepository(),
    now: () => 1_000,
    logger: { error() {}, warn() {} },
    users: [user],
    sessionSecret: 'test-secret'
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', () => resolve()));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('KartBoard test server has no port.');
  const base = `http://127.0.0.1:${address.port}`;
  const cookie = await login(base);
  try { await run(base, cookie); }
  finally { await app.close(); }
}

async function login(base) {
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers: mutationHeaders(base), body: JSON.stringify({ name: 'KAC', pin: '2468' }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /kartboard_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.doesNotMatch(cookie, /Secure/i);
  return cookie.split(';')[0];
}

function post(base, body, cookie) {
  return fetch(`${base}/api/action`, { method: 'POST', headers: mutationHeaders(base, cookie), body: JSON.stringify(body) });
}

test('exposes version metadata and state without a session', () => withServer(async base => {
  const meta = await fetch(`${base}/api/meta`).then(response => response.json());
  assert.equal(meta.apiVersion, 2);
  assert.ok(meta.actions.includes('updateRotation'));
  const state = await fetch(`${base}/api/state`).then(response => response.json());
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.updatedBy, '');
}));

test('updates state and returns structured errors', () => withServer(async (base, cookie) => {
  const initial = await fetch(`${base}/api/state`).then(response => response.json());
  let response = await post(base, { action: 'start', expectedRevision: initial.revision }, cookie);
  assert.equal(response.status, 200);
  let state = await response.json();
  assert.equal(state.status, 'running');
  assert.equal(state.updatedBy, 'KAC');
  response = await post(base, { action: 'unknown', expectedRevision: state.revision }, cookie);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'UNKNOWN_ACTION');
}));

test('requires a revision on every mutation and rejects stale ones', () => withServer(async (base, cookie) => {
  const initial = await fetch(`${base}/api/state`).then(response => response.json());
  const missing = await post(base, { action: 'notice', payload: { notice: 'First' } }, cookie);
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, 'REVISION_REQUIRED');
  await post(base, { action: 'notice', payload: { notice: 'First' }, expectedRevision: initial.revision }, cookie);
  const conflict = await post(base, { action: 'updateRotation', payload: { rotation: initial.rotation }, expectedRevision: initial.revision }, cookie);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, 'REVISION_CONFLICT');
  const current = await fetch(`${base}/api/state`).then(response => response.json());
  assert.equal(current.notice, 'First');
}));

test('serves app files and blocks traversal', () => withServer(async base => {
  assert.equal((await fetch(`${base}/control.html`)).status, 200);
  assert.equal((await fetch(`${base}/board.html`)).status, 200);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
}));

test('streams public state events', () => withServer(async (base, cookie) => {
  const response = await fetch(`${base}/api/events`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const { value } = await reader.read();
  assert.match(Buffer.from(value).toString(), /event: state/);
  await reader.cancel();
  const initial = await fetch(`${base}/api/state`).then(item => item.json());
  const updated = await post(base, { action: 'notice', payload: { notice: 'Live' }, expectedRevision: initial.revision }, cookie);
  assert.equal(updated.status, 200);
}));
