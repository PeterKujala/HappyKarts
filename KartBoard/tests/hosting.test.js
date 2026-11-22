const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { HOSTED_BASE_PATH } = require('../src/http/constants');
const { createKartBoardApp } = require('../src/application/create-app');
const { createDefaultState } = require('../src/domain/state');
const { controllerUser, mutationHeaders } = require('./helpers');

class MemoryRepository {
  constructor() { this.state = createDefaultState(100); }
  load() { return this.state; }
  save(state) { this.state = structuredClone(state); }
}

class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
}

test('base path routes the hosted API and rejects the unprefixed API', async () => {
  const user = await controllerUser();
  const app = createKartBoardApp({
    basePath: HOSTED_BASE_PATH,
    publicDir: path.join(__dirname, '..', 'public'),
    repository: new MemoryRepository(),
    now: () => 1_000,
    users: [user],
    sessionSecret: 'test-secret',
    logger: { error() {} }
  });
  const board = await app.handle(new Request(`https://designacle.au${HOSTED_BASE_PATH}/board.html`));
  assert.equal(board.status, 200);
  assert.match(await board.text(), /Live Practice/);
  const outside = await app.handle(new Request('https://designacle.au/api/state'));
  assert.equal(outside.status, 404);
  const state = await app.handle(new Request(`https://designacle.au${HOSTED_BASE_PATH}/api/state`));
  assert.equal(state.status, 200);
  const root = await app.handle(new Request(`https://designacle.au${HOSTED_BASE_PATH}`));
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), `${HOSTED_BASE_PATH}/control.html`);
  const traversal = await app.handle(new Request(`https://designacle.au${HOSTED_BASE_PATH}/%2e%2e/package.json`));
  assert.equal(traversal.status, 404);
});

test('browser files use document-relative URLs', () => {
  const files = ['public/board.html', 'public/control.html', 'public/index.html', 'public/board.js', 'public/control.js', 'public/js/api.js'];
  for (const file of files) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(text, /(?:src|href)=["']\//, file);
    assert.doesNotMatch(text, /(?:fetch|EventSource|window\.open)\(\s*['"]\//, file);
  }
});

test('worker serves the public board and keeps mutations behind the room', async () => {
  await import('../scripts/embed-assets.mjs');
  const user = await controllerUser();
  const storage = new MemoryStorage();
  const { default: worker, KartBoardRoom } = await import('../worker/index.mjs');
  const env = {
    KARTBOARD_USERS: JSON.stringify({ users: [user] }),
    KARTBOARD_SESSION_SECRET: 'test-secret',
    KARTBOARD: {
      idFromName: () => 'practice-day',
      get: () => ({ fetch: request => room.fetch(request) })
    }
  };
  const room = new KartBoardRoom({ storage, blockConcurrencyWhile: fn => fn() }, env);
  const board = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/board.html`), env);
  assert.equal(board.status, 200);
  assert.match(await board.text(), /Live Practice/);
  const control = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/control.html`), env);
  assert.equal(control.status, 200);
  const state = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/api/state`), env);
  assert.equal(state.status, 200);
  const denied = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/api/action`, {
    method: 'POST',
    headers: mutationHeaders(`https://designacle.au${HOSTED_BASE_PATH}/api/action`),
    body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  }), env);
  assert.equal(denied.status, 401);
  const login = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/api/login`, {
    method: 'POST',
    headers: mutationHeaders(`https://designacle.au${HOSTED_BASE_PATH}/api/login`),
    body: JSON.stringify({ name: 'KAC', pin: '2468' })
  }), env);
  assert.equal(login.status, 200);
  const setCookie = login.headers.getSetCookie()[0];
  assert.match(setCookie, /Path=\/auth\/apps\/kartboard/);
  const cookie = setCookie.split(';')[0];
  const changed = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/api/action`, {
    method: 'POST',
    headers: mutationHeaders(`https://designacle.au${HOSTED_BASE_PATH}/api/action`, cookie),
    body: JSON.stringify({ action: 'notice', payload: { notice: 'Hosted' }, expectedRevision: 0 })
  }), env);
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).updatedBy, 'KAC');
  const saved = await storage.get('state');
  assert.equal(saved.notice, 'Hosted');
  assert.equal((await worker.fetch(new Request('https://designacle.au/api/state'), env)).status, 404);
});
