const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKartBoardApp } = require('../src/application/create-app');
const { createDefaultState } = require('../src/domain/state');
const { CODE_ALPHABET, CODE_LENGTH, generateAccessCode, hashAccessCode } = require('../src/auth/codes');
const { CODE_KEY_INFO, SESSION_SECRET_INFO, sealCode, openCode } = require('../src/auth/code-seal');
const { MemoryAccessCodeStore } = require('../src/infrastructure/access-code-store');
const { DEFAULT_ITERATIONS, verifySecret } = require('../src/auth/users');
const { clearCertCache } = require('../src/auth/access');
const { ADMIN_BASE_PATH, HOSTED_BASE_PATH } = require('../src/http/constants');
const { mutationHeaders, controllerUser } = require('./helpers');

class MemoryRepository {
  constructor() { this.state = createDefaultState(100); }
  load() { return this.state; }
  save(state) { this.state = structuredClone(state); }
}

async function build(overrides = {}) {
  const user = overrides.user || await controllerUser();
  const app = createKartBoardApp({
    repository: overrides.repository || new MemoryRepository(),
    now: overrides.now || (() => 5_000),
    users: overrides.users === undefined ? [user] : overrides.users,
    sessionSecret: overrides.sessionSecret === undefined ? 'test-secret' : overrides.sessionSecret,
    codeKey: overrides.codeKey || '',
    codeIterations: overrides.codeIterations === undefined ? 1_000 : overrides.codeIterations,
    accessCodes: overrides.accessCodes,
    accessCodesFile: overrides.accessCodesFile,
    adminToken: overrides.adminToken || '',
    basePath: overrides.basePath || '',
    logger: { error() {}, warn() {} }
  });
  await app.board.ready;
  return app;
}

function adminHeaders(url, extra = {}) {
  return { ...mutationHeaders(url), 'x-kartboard-client-ip': '127.0.0.1', ...extra };
}

async function createCode(app, name, url = 'http://127.0.0.1/api/admin/codes') {
  const response = await app.handle(new Request(url, {
    method: 'POST',
    headers: adminHeaders(url),
    body: JSON.stringify({ name })
  }));
  assert.equal(response.status, 201);
  return response.json();
}

test('access codes use an 8 character alphabet without confusable characters', () => {
  assert.equal(CODE_LENGTH, 8);
  assert.equal(CODE_ALPHABET.length, 32);
  for (const char of '0o1l') assert.equal(CODE_ALPHABET.includes(char), false);
  const code = generateAccessCode(bytes => { bytes.set([0, 31, 32, 255, 1, 16, 30, 33]); });
  assert.equal(code.length, 8);
  assert.match(code, /^[abcdefghijkmnpqrstuvwxyz23456789]{8}$/);
  assert.equal(code[0], CODE_ALPHABET[0]);
  assert.equal(code[1], CODE_ALPHABET[31]);
  assert.equal(code[2], CODE_ALPHABET[0]);
  assert.equal(code[3], CODE_ALPHABET[31]);
  for (let index = 0; index < 40; index += 1) {
    const sample = generateAccessCode();
    assert.equal(sample.length, 8);
    assert.match(sample, /^[abcdefghijkmnpqrstuvwxyz23456789]+$/);
  }
});

test('hashes access codes with PBKDF2 and does not keep the code', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const first = await hashAccessCode('k7m2p9qa', { name: 'Controller', salt, iterations: 1_000 });
  const second = await hashAccessCode('k7m2p9qa', { name: 'Controller', salt, iterations: 1_000 });
  const other = await hashAccessCode('k7m2p9qb', { name: 'Controller', salt, iterations: 1_000 });
  assert.equal(first.hash, second.hash);
  assert.notEqual(first.hash, other.hash);
  assert.notEqual(first.hash, 'k7m2p9qa');
  assert.equal(first.iterations, 1_000);
  assert.equal(await verifySecret('k7m2p9qa', first), true);
  assert.equal(await verifySecret('K7M2P9QA', first), false);
  const standard = await hashAccessCode('abcd2345', { name: 'Controller' });
  assert.equal(standard.iterations, DEFAULT_ITERATIONS);
});

test('admin can create, list, and revoke codes without showing them again', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kartboard-codes-'));
  const file = path.join(directory, 'codes.json');
  const app = await build({ users: [], accessCodesFile: file });
  const created = await createCode(app, 'Controller');
  assert.match(created.code, /^[abcdefghijkmnpqrstuvwxyz23456789]{8}$/);
  assert.equal(created.name, 'Controller');
  const listed = await app.handle(new Request('http://127.0.0.1/api/admin/codes', { headers: { 'x-kartboard-client-ip': '127.0.0.1' } }));
  const body = await listed.json();
  assert.equal(body.codes.length, 1);
  assert.equal(body.codes[0].name, 'Controller');
  assert.equal(body.codes[0].source, 'managed');
  assert.equal(body.codes[0].code, created.code);
  assert.equal(body.codes[0].hash, undefined);
  assert.equal(body.codes[0].salt, undefined);
  assert.equal(body.codes[0].codeCipher, undefined);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(Object.hasOwn(saved.codes[0], 'code'), false);
  assert.notEqual(saved.codes[0].hash, created.code);
  assert.notEqual(saved.codes[0].codeCipher, created.code);
  assert.equal(saved.codes[0].codeCipher.includes(created.code), false);
  const duplicate = await app.handle(new Request('http://127.0.0.1/api/admin/codes', {
    method: 'POST', headers: adminHeaders('http://127.0.0.1/api/admin/codes'), body: JSON.stringify({ name: 'Controller' })
  }));
  assert.equal(duplicate.status, 409);
  const revoked = await app.handle(new Request('http://127.0.0.1/api/admin/codes/revoke', {
    method: 'POST', headers: adminHeaders('http://127.0.0.1/api/admin/codes/revoke'), body: JSON.stringify({ name: 'Controller' })
  }));
  assert.equal(revoked.status, 200);
  const after = await (await app.handle(new Request('http://127.0.0.1/api/admin/codes', { headers: { 'x-kartboard-client-ip': '127.0.0.1' } }))).json();
  assert.equal(after.codes.length, 0);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('admin list shows a sealed code and hides hashes, seeds, and codes saved before sealing', async () => {
  assert.notEqual(CODE_KEY_INFO, SESSION_SECRET_INFO);
  const sealed = await sealCode('k7m2p9qa', { codeKey: 'dedicated-key' });
  assert.equal(await openCode({ ...sealed }, { codeKey: 'dedicated-key' }), 'k7m2p9qa');
  assert.equal(await openCode({ ...sealed }, { sessionSecret: 'dedicated-key' }), null);
  assert.equal(await openCode({ ...sealed }, { codeKey: 'other-key' }), null);
  const legacyHash = await hashAccessCode('k7m2p9qa', { name: 'Old', iterations: 1_000 });
  const store = new MemoryAccessCodeStore([{
    id: 'legacy', name: 'Old', salt: legacyHash.salt, hash: legacyHash.hash, iterations: 1_000, version: 1, createdAt: 1, lastUsedAt: null
  }]);
  const app = await build({ users: [await controllerUser('Seed', '1357')], accessCodes: store, codeKey: 'dedicated-key' });
  const created = await createCode(app, 'Shown');
  const body = await (await app.handle(new Request('http://127.0.0.1/api/admin/codes', { headers: { 'x-kartboard-client-ip': '127.0.0.1' } }))).json();
  const byName = Object.fromEntries(body.codes.map(item => [item.name, item.code]));
  assert.equal(byName.Shown, created.code);
  assert.equal(byName.Old, null);
  assert.equal(byName.Seed, null);
  const fallback = await build({ users: [], accessCodes: store, codeKey: '', sessionSecret: 'test-secret' });
  const hidden = await (await fallback.handle(new Request('http://127.0.0.1/api/admin/codes', { headers: { 'x-kartboard-client-ip': '127.0.0.1' } }))).json();
  assert.equal(hidden.codes.find(item => item.name === 'Shown').code, null);
  const still = await fallback.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/login'), body: JSON.stringify({ code: created.code })
  }));
  assert.equal(still.status, 200);
  const replaced = await fallback.handle(new Request('http://127.0.0.1/api/admin/codes/regenerate', {
    method: 'POST', headers: adminHeaders('http://127.0.0.1/api/admin/codes/regenerate'), body: JSON.stringify({ name: 'Old' })
  }));
  const next = await replaced.json();
  const visible = await (await fallback.handle(new Request('http://127.0.0.1/api/admin/codes', { headers: { 'x-kartboard-client-ip': '127.0.0.1' } }))).json();
  assert.equal(visible.codes.find(item => item.name === 'Old').code, next.code);
  const page = fs.readFileSync(path.join(__dirname, '..', 'public/admin.js'), 'utf8');
  assert.match(page, /Hidden — regenerate to view/);
});

test('a code alone signs in the matching controller and a revoked code kills that session', async () => {
  const app = await build({ users: [] });
  const created = await createCode(app, 'Controller');
  const login = await app.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST',
    headers: mutationHeaders('http://127.0.0.1/api/login'),
    body: JSON.stringify({ code: created.code.toUpperCase() })
  }));
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user, 'Controller');
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const started = await app.handle(new Request('http://127.0.0.1/api/action', {
    method: 'POST',
    headers: mutationHeaders('http://127.0.0.1/api/action', cookie),
    body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  }));
  assert.equal(started.status, 200);
  assert.equal((await started.json()).updatedBy, 'Controller');
  const listed = await (await app.handle(new Request('http://127.0.0.1/api/admin/codes', { headers: { 'x-kartboard-client-ip': '127.0.0.1' } }))).json();
  assert.equal(typeof listed.codes[0].lastUsedAt, 'number');
  const revoked = await app.handle(new Request('http://127.0.0.1/api/admin/codes/revoke', {
    method: 'POST', headers: adminHeaders('http://127.0.0.1/api/admin/codes/revoke'), body: JSON.stringify({ name: 'Controller' })
  }));
  assert.equal(revoked.status, 200);
  const stale = await app.handle(new Request('http://127.0.0.1/api/action', {
    method: 'POST',
    headers: mutationHeaders('http://127.0.0.1/api/action', cookie),
    body: JSON.stringify({ action: 'notice', payload: { notice: 'nope' }, expectedRevision: 1 })
  }));
  assert.equal(stale.status, 401);
  const again = await app.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/login'), body: JSON.stringify({ code: created.code })
  }));
  assert.equal(again.status, 503);
});

test('regenerating a code invalidates the previous session and the seed code stays a fallback', async () => {
  const seed = await controllerUser('Controller', '2468');
  const app = await build({ users: [seed] });
  const named = await app.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/login'), body: JSON.stringify({ name: 'Controller', pin: '2468' })
  }));
  assert.equal(named.status, 200);
  const codeOnly = await app.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/login'), body: JSON.stringify({ code: '2468' })
  }));
  assert.equal((await codeOnly.json()).user, 'Controller');
  const created = await createCode(app, 'Controller');
  const oldSeed = await app.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/login'), body: JSON.stringify({ code: '2468' })
  }));
  assert.equal(oldSeed.status, 401);
  const replacement = await app.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/login'), body: JSON.stringify({ code: created.code })
  }));
  const cookie = replacement.headers.getSetCookie()[0].split(';')[0];
  const regenerated = await app.handle(new Request('http://127.0.0.1/api/admin/codes/regenerate', {
    method: 'POST', headers: adminHeaders('http://127.0.0.1/api/admin/codes/regenerate'), body: JSON.stringify({ name: 'Controller' })
  }));
  const next = await regenerated.json();
  assert.notEqual(next.code, created.code);
  const blocked = await app.handle(new Request('http://127.0.0.1/api/action', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/action', cookie), body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  }));
  assert.equal(blocked.status, 401);
  const fresh = await app.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/login'), body: JSON.stringify({ code: next.code })
  }));
  assert.equal(fresh.status, 200);
});

test('advance by one minute follows the normal action rules and is visible on the public state', async () => {
  const app = await build();
  const denied = await app.handle(new Request('http://127.0.0.1/api/action', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/action'), body: JSON.stringify({ action: 'advanceMinute', expectedRevision: 0 })
  }));
  assert.equal(denied.status, 401);
  const login = await app.handle(new Request('http://127.0.0.1/api/login', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/login'), body: JSON.stringify({ code: '2468' })
  }));
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const started = await app.handle(new Request('http://127.0.0.1/api/action', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/action', cookie), body: JSON.stringify({ action: 'start', expectedRevision: 0 })
  }));
  const running = await started.json();
  const missing = await app.handle(new Request('http://127.0.0.1/api/action', {
    method: 'POST', headers: mutationHeaders('http://127.0.0.1/api/action', cookie), body: JSON.stringify({ action: 'advanceMinute' })
  }));
  assert.equal(missing.status, 400);
  const cross = await app.handle(new Request('http://127.0.0.1/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: 'https://evil.example' },
    body: JSON.stringify({ action: 'advanceMinute', expectedRevision: running.revision })
  }));
  assert.equal(cross.status, 403);
  const advanced = await app.handle(new Request('http://127.0.0.1/api/action', {
    method: 'POST',
    headers: mutationHeaders('http://127.0.0.1/api/action', cookie),
    body: JSON.stringify({ action: 'advanceMinute', expectedRevision: running.revision })
  }));
  assert.equal(advanced.status, 200);
  const view = await advanced.json();
  assert.equal(view.startedAt, running.startedAt - 60_000);
  const board = await (await app.handle(new Request('http://127.0.0.1/api/state'))).json();
  assert.equal(board.startedAt, view.startedAt);
  assert.equal(board.revision, view.revision);
});

test('local admin is refused away from this computer unless the admin token matches', async () => {
  const open = await build({ users: [] });
  const remote = await open.handle(new Request('http://127.0.0.1/api/admin/codes', { headers: { 'x-kartboard-client-ip': '203.0.113.8' } }));
  assert.equal(remote.status, 401);
  assert.equal((await remote.json()).error.code, 'ADMIN_REQUIRED');
  const locked = await build({ users: [], adminToken: 'local-secret' });
  const loopback = await locked.handle(new Request('http://127.0.0.1/api/admin/codes', { headers: { 'x-kartboard-client-ip': '127.0.0.1' } }));
  assert.equal(loopback.status, 401);
  const allowed = await locked.handle(new Request('http://10.0.0.8/api/admin/codes', {
    headers: { 'x-kartboard-client-ip': '203.0.113.8', authorization: 'Bearer local-secret' }
  }));
  assert.equal(allowed.status, 200);
});

test('hosted admin rejects a missing or invalid Access JWT and fails closed without ACCESS_AUD', async () => {
  clearCertCache();
  await import('../scripts/embed-assets.mjs');
  const { token, jwk, email } = await signAccessToken();
  const { default: worker } = await import('../worker/index.mjs');
  const storage = new MapStorage();
  const env = {
    ACCESS_AUD: 'aud-tag-for-tests',
    KARTBOARD_SESSION_SECRET: 'test-secret',
    KARTBOARD_USERS: '{"users":[]}',
    __fetchCerts: async () => [jwk],
    __accessNow: Date.UTC(2026, 10, 22, 6, 0, 0),
    KARTBOARD: { idFromName: () => 'practice-day', get: () => ({ fetch: request => room.fetch(request) }) }
  };
  const { KartBoardRoom } = await import('../worker/room.mjs');
  const room = new KartBoardRoom({ storage, blockConcurrencyWhile: fn => fn() }, env);
  const adminUrl = `https://designacle.au${ADMIN_BASE_PATH}/api/admin/codes`;
  const missing = await worker.fetch(new Request(adminUrl), env);
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, 'ACCESS_REQUIRED');
  const page = await worker.fetch(new Request(`https://designacle.au${ADMIN_BASE_PATH}/admin.html`, { headers: { accept: 'text/html' } }), env);
  assert.equal(page.status, 401);
  assert.match(await page.text(), /Not signed in/);
  const garbage = await worker.fetch(new Request(adminUrl, { headers: { 'Cf-Access-Jwt-Assertion': 'a.b.c' } }), env);
  assert.equal(garbage.status, 401);
  const unconfigured = await worker.fetch(new Request(adminUrl, { headers: { 'Cf-Access-Jwt-Assertion': token } }), { ...env, ACCESS_AUD: '' });
  assert.equal(unconfigured.status, 401);
  assert.equal((await unconfigured.json()).error.code, 'ADMIN_NOT_CONFIGURED');
  const accepted = await worker.fetch(new Request(adminUrl, { headers: { 'Cf-Access-Jwt-Assertion': token } }), env);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { codes: [] });
  const forbidden = await worker.fetch(new Request(adminUrl, { headers: { 'Cf-Access-Jwt-Assertion': token } }), { ...env, ADMIN_EMAILS: 'other@example.com' });
  assert.equal(forbidden.status, 403);
  assert.equal(email.includes('@'), true);
  const redirect = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/admin.html`), env);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), `${ADMIN_BASE_PATH}/admin.html`);
  const hiddenApi = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/api/admin/codes`, { headers: { 'Cf-Access-Jwt-Assertion': token } }), env);
  assert.equal(hiddenApi.status, 404);
  const board = await worker.fetch(new Request(`https://designacle.au${HOSTED_BASE_PATH}/help.html`), env);
  assert.equal(board.status, 200);
});

class MapStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
}

async function signAccessToken() {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = /** @type {JsonWebKey & { kid?: string, alg?: string, use?: string }} */ (await crypto.subtle.exportKey('jwk', kp.publicKey));
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const now = Date.UTC(2026, 10, 22, 6, 0, 0);
  const email = 'peter@example.com';
  const header = base64Url(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }));
  const body = base64Url(JSON.stringify({
    iss: 'https://designacle.cloudflareaccess.com',
    aud: ['aud-tag-for-tests'],
    email,
    exp: Math.floor(now / 1000) + 3600,
    nbf: Math.floor(now / 1000) - 10
  }));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, kp.privateKey, new TextEncoder().encode(`${header}.${body}`)));
  return { token: `${header}.${body}.${base64Url(signature)}`, jwk, email };
}

function base64Url(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
