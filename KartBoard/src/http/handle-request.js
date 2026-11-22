const { DomainError } = require('../domain/errors');
const { SCHEMA_VERSION } = require('../domain/state');
const { ACTION_NAMES, reduceState } = require('../domain/reducer');
const { locate } = require('./paths');
const { assertMutatingRequest } = require('../auth/origin');
const { readCookie, verifySession, signSession, sessionCookie, clearSessionCookie } = require('../auth/session');
const { PIN_PATTERN } = require('../auth/users');
const { API_VERSION, SESSION_COOKIE, SESSION_TTL_MS, MAX_BODY_BYTES, SECURITY_HEADERS } = require('./constants');

async function handleKartBoardRequest(request, ctx) {
  try {
    const url = new URL(request.url);
    const located = locate(url.pathname, ctx.basePath || '');
    if (located.error === 'outside') return text('Not found', 404);
    if (located.error) return json({ error: { code: 'NOT_FOUND', message: 'File not found.' } }, 404);
    const route = routeOf(located.path);
    if (route.kind === 'meta') return await allowRead(request, () => json({ apiVersion: API_VERSION, schemaVersion: SCHEMA_VERSION, actions: ACTION_NAMES }));
    if (route.kind === 'state') return await allowRead(request, async () => json(await ctx.board.read()));
    if (route.kind === 'events') return await allowRead(request, () => subscribe(request, ctx));
    if (route.kind === 'session') return await allowRead(request, () => sessionStatus(request, ctx));
    if (route.kind === 'login') return await postOnly(request, () => login(request, ctx));
    if (route.kind === 'logout') return await postOnly(request, () => logout(request, ctx));
    if (route.kind === 'action') return await postOnly(request, () => action(request, ctx));
    if (route.kind === 'api-missing') return json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }, 404);
    if (located.path === '/') return redirect(`${ctx.basePath || ''}/control.html`);
    return serveAsset(request, located.path, ctx);
  } catch (error) {
    return fail(error, ctx);
  }
}

function routeOf(pathname) {
  if (pathname === '/api/meta') return { kind: 'meta' };
  if (pathname === '/api/state') return { kind: 'state' };
  if (pathname === '/api/events') return { kind: 'events' };
  if (pathname === '/api/session') return { kind: 'session' };
  if (pathname === '/api/login') return { kind: 'login' };
  if (pathname === '/api/logout') return { kind: 'logout' };
  if (pathname === '/api/action') return { kind: 'action' };
  if (pathname === '/api' || pathname.startsWith('/api/')) return { kind: 'api-missing' };
  return { kind: 'asset' };
}

function allowRead(request, run) {
  if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed('GET, HEAD');
  return run();
}

function postOnly(request, run) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  return run();
}

async function subscribe(request, ctx) {
  const view = await ctx.board.read();
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no'
  };
  if (request.method === 'HEAD') return text('', 200, headers);
  return new Response(ctx.events.subscribe(view), { status: 200, headers: applySecurity(headers) });
}

async function sessionStatus(request, ctx) {
  const actor = await readActor(request, ctx);
  return json({ authenticated: Boolean(actor), user: actor, users: ctx.users.names });
}

async function login(request, ctx) {
  assertMutatingRequest(request);
  if (!ctx.sessionSecret) throw new DomainError('NOT_CONFIGURED', 'KartBoard has no session secret yet.', 503);
  if (!ctx.users.configured) throw new DomainError('NOT_CONFIGURED', 'No controller PINs are registered yet.', 503);
  const body = await readJson(request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';
  const ip = clientIp(request, ctx);
  const gate = ctx.rateLimit.attempt({ ip, user: name || 'unknown' });
  if (!gate.ok) return rateLimited(gate.retryAfterMs);
  if (!name || !PIN_PATTERN.test(pin)) throw new DomainError('INVALID_PIN', 'That name or PIN was not recognised.', 401);
  const user = await ctx.users.authenticate(name, pin);
  if (!user) throw new DomainError('INVALID_PIN', 'That name or PIN was not recognised.', 401);
  ctx.rateLimit.succeed({ ip, user });
  const token = await signSession({ u: user, exp: ctx.now() + SESSION_TTL_MS }, ctx.sessionSecret);
  return json({ ok: true, user }, 200, { 'Set-Cookie': sessionCookie(token, cookieOptions(request, ctx)) });
}

function logout(request, ctx) {
  assertMutatingRequest(request);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(cookieOptions(request, ctx)) });
}

async function action(request, ctx) {
  assertMutatingRequest(request);
  const actor = await readActor(request, ctx);
  if (!actor) throw new DomainError('AUTH_REQUIRED', 'Sign in from the controller to change KartBoard.', 401);
  const body = await readJson(request);
  if (!Number.isInteger(body.expectedRevision)) {
    throw new DomainError('REVISION_REQUIRED', 'Every change must include the revision you last saw.', 400);
  }
  const view = await ctx.board.commit(current => {
    if (body.expectedRevision !== current.revision) {
      throw new DomainError('REVISION_CONFLICT', 'KartBoard was changed by another controller. Refresh and try again.', 409);
    }
    const next = reduceState(current, body.action, body.payload, ctx.now());
    next.updatedBy = actor;
    return next;
  });
  return json(view);
}

function serveAsset(request, pathname, ctx) {
  if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed('GET, HEAD');
  const asset = ctx.asset(pathname);
  if (!asset) return json({ error: { code: 'NOT_FOUND', message: 'File not found.' } }, 404);
  const headers = { 'Content-Type': asset.type, 'Content-Length': String(asset.size ?? asset.body.length), 'Cache-Control': 'no-cache' };
  return new Response(request.method === 'HEAD' ? null : asset.body, { status: 200, headers: applySecurity(headers) });
}

async function readActor(request, ctx) {
  if (!ctx.sessionSecret) return null;
  const token = readCookie(request.headers.get('cookie'));
  const payload = await verifySession(token, ctx.sessionSecret, ctx.now());
  if (!payload || !ctx.users.has(payload.u)) return null;
  return payload.u;
}

function cookieOptions(request, ctx) {
  return { basePath: ctx.basePath || '', secure: new URL(request.url).protocol === 'https:' };
}

function clientIp(request, ctx) {
  return ctx.clientIp ? ctx.clientIp(request) : 'unknown';
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new DomainError('REQUEST_TOO_LARGE', 'Request body is too large.', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new DomainError('REQUEST_TOO_LARGE', 'Request body is too large.', 413);
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new DomainError('INVALID_JSON', 'Request body must be valid JSON.'); }
}

function rateLimited(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return json({ error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Wait and try again.' } }, 429, { 'Retry-After': String(seconds) });
}

function methodNotAllowed(allow) {
  return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405, { Allow: allow });
}

function redirect(location) {
  return new Response(null, { status: 302, headers: applySecurity({ Location: location, 'Cache-Control': 'no-store' }) });
}

function json(value, status = 200, extra = {}) {
  const body = JSON.stringify(value);
  return text(body, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
}

function text(body, status, extra = {}) {
  return new Response(body, { status, headers: applySecurity(extra) });
}

function applySecurity(extra) {
  return { ...SECURITY_HEADERS, ...extra };
}

function fail(error, ctx) {
  if (!(error instanceof DomainError)) ctx.logger?.error?.(error);
  const status = error instanceof DomainError ? error.status : 500;
  const code = error instanceof DomainError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof DomainError ? error.message : 'KartBoard could not complete the request.';
  return json({ error: { code, message } }, status);
}

module.exports = { API_VERSION, handleKartBoardRequest, SESSION_COOKIE };
