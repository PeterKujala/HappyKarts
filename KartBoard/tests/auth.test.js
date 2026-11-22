const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultState } = require('../src/domain/state');
const { createKartBoardApp } = require('../src/application/create-app');
const { signSession } = require('../src/auth/session');
const { RateLimiter } = require('../src/auth/rate-limit');
const { controllerUser, mutationHeaders } = require('./helpers');
const { PUBLIC_BOARD_URL, CONTROLLER_URL } = require('../src/http/constants');

class MemoryRepository {
  constructor() { this.state = createDefaultState(100); this.saves = 0; }
  load() { return this.state; }
  save(state) { this.saves += 1; this.state = structuredClone(state); }
}

async function build(overrides = {}) {
  const user = overrides.user || await controllerUser();
  const repository = overrides.repository || new MemoryRepository();
  const rateLimit = overrides.rateLimit || new RateLimiter({ maxFailures: 2, windowMs: 1_000, now: overrides.now || (() => 5_000) });
  const app = createKartBoardApp({
    repository,
    now: overrides.now || (() => 5_000),
    users: overrides.users || [user],
    sessionSecret: overrides.sessionSecret === undefined ? 'test-secret' : overrides.sessionSecret,
    rateLimit,
    logger: { error() {} },
    asset: () => null,
    basePath: overrides.basePath || ''
  });
  await app.board.ready;
  return { app, repository, rateLimit, user };
}

async function handle(app, url, init = {}) {
  return app.handle(new Request(url, init));
}

test('public reads stay open and mutations require a controller session', async () => {
  const { app, repository } = await build();
  const state = await handle(app, 'https://designacle.au/api/state');
  assert.equal(state.status, 200);
  const before = repository.saves;
  const denied = await handle(app, 'https://designacle.au/api/action', {
    method: 'POST',
    headers: mutationHeaders('https://designacle.au/api/action'),
    body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  });
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).error.code, 'AUTH_REQUIRED');
  assert.equal(repository.saves, before);
  const events = await handle(app, 'https://designacle.au/api/events');
  assert.equal(events.status, 200);
  await events.body.cancel();
});

test('PIN login sets a signed cookie and logout clears it', async () => {
  const { app } = await build();
  const response = await handle(app, 'https://designacle.au/api/login', {
    method: 'POST',
    headers: mutationHeaders('https://designacle.au/api/login'),
    body: JSON.stringify({ name: 'KAC', pin: '2468' })
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const session = await handle(app, 'https://designacle.au/api/session', { headers: { cookie: cookie.split(';')[0] } });
  assert.equal((await session.json()).user, 'KAC');
  const loggedOut = await handle(app, 'https://designacle.au/api/logout', {
    method: 'POST',
    headers: mutationHeaders('https://designacle.au/api/logout', cookie.split(';')[0]),
    body: '{}'
  });
  assert.match(loggedOut.headers.getSetCookie()[0], /Max-Age=0/);
});

test('rejects a bad PIN, a tampered session, and a removed controller', async () => {
  const { app } = await build();
  const bad = await handle(app, 'https://designacle.au/api/login', {
    method: 'POST',
    headers: mutationHeaders('https://designacle.au/api/login'),
    body: JSON.stringify({ name: 'KAC', pin: '9999' })
  });
  assert.equal(bad.status, 401);
  const forged = await signSession({ u: 'KAC', exp: 10_000 }, 'other-secret');
  const tampered = await handle(app, 'https://designacle.au/api/action', {
    method: 'POST',
    headers: mutationHeaders('https://designacle.au/api/action', `kartboard_session=${forged}`),
    body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  });
  assert.equal(tampered.status, 401);
  const expired = await signSession({ u: 'KAC', exp: 1 }, 'test-secret');
  const stale = await handle(app, 'https://designacle.au/api/action', {
    method: 'POST',
    headers: mutationHeaders('https://designacle.au/api/action', `kartboard_session=${expired}`),
    body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  });
  assert.equal(stale.status, 401);
});

test('rate limits sign-in attempts by IP and by user', async () => {
  let clock = 10_000;
  const { app } = await build({ now: () => clock });
  const attempt = (name, pin, ip) => handle(app, 'https://designacle.au/api/login', {
    method: 'POST',
    headers: { ...mutationHeaders('https://designacle.au/api/login'), 'x-kartboard-client-ip': ip },
    body: JSON.stringify({ name, pin })
  });
  assert.equal((await attempt('KAC', '0000', '1.1.1.1')).status, 401);
  assert.equal((await attempt('KAC', '0000', '1.1.1.1')).status, 401);
  const blockedIp = await attempt('Other', '2468', '1.1.1.1');
  assert.equal(blockedIp.status, 429);
  assert.equal((await attempt('KAC', '0000', '2.2.2.2')).status, 429);
  const other = await controllerUser('Other', '1357');
  const second = await build({ now: () => clock, users: [await controllerUser(), other] });
  assert.equal((await handle(second.app, 'https://designacle.au/api/login', {
    method: 'POST',
    headers: { ...mutationHeaders('https://designacle.au/api/login'), 'x-kartboard-client-ip': '3.3.3.3' },
    body: JSON.stringify({ name: 'Other', pin: '1357' })
  })).status, 200);
  clock += 2_000;
  const again = await attempt('KAC', '2468', '9.9.9.9');
  assert.equal(again.status, 200);
});

test('blocks cross-site posts even with a valid session', async () => {
  const { app } = await build();
  const login = await handle(app, 'https://designacle.au/api/login', {
    method: 'POST',
    headers: mutationHeaders('https://designacle.au/api/login'),
    body: JSON.stringify({ name: 'KAC', pin: '2468' })
  });
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const cross = await handle(app, 'https://designacle.au/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: 'https://evil.example' },
    body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  });
  assert.equal(cross.status, 403);
  assert.equal((await cross.json()).error.code, 'CROSS_ORIGIN');
  const textBody = await handle(app, 'https://designacle.au/api/action', {
    method: 'POST',
    headers: { ...mutationHeaders('https://designacle.au/api/action', cookie), 'content-type': 'text/plain' },
    body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  });
  assert.equal(textBody.status, 415);
});

test('hosted URLs are the dashboard targets', () => {
  assert.equal(PUBLIC_BOARD_URL, 'https://designacle.au/auth/apps/kartboard/board.html');
  assert.equal(CONTROLLER_URL, 'https://designacle.au/auth/apps/kartboard/control.html');
});
