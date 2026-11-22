const { DomainError } = require('../domain/errors');
const { SCHEMA_VERSION } = require('../domain/state');
const { ACTION_NAMES, reduceState } = require('../domain/reducer');
const { classify, adminRoute } = require('./surface');
const { assertMutatingRequest } = require('../auth/origin');
const { readCookie, verifySession, signSession, sessionCookie, clearSessionCookie } = require('../auth/session');
const { codeAttemptKey } = require('../auth/codes');
const { authorizeHostedAdmin, authorizeLocalAdmin } = require('../auth/access');
const { API_VERSION, SESSION_COOKIE, SESSION_TTL_MS, MAX_BODY_BYTES, SECURITY_HEADERS } = require('./constants');

async function handleKartBoardRequest(request, ctx) {
  try {
    const url = new URL(request.url);
    const kind = classify(url.pathname, {
      basePath: ctx.basePath || '',
      adminBasePath: ctx.adminBasePath === undefined ? (ctx.basePath || '') : ctx.adminBasePath
    });
    if (kind.area === 'missing') {
      if (kind.error === 'outside') return text('Not found', 404);
      return json({ error: { code: 'NOT_FOUND', message: 'File not found.' } }, 404);
    }
    if (kind.area === 'admin-redirect') return redirect(kind.redirect);
    if (kind.area === 'admin') return await serveAdminAsset(request, ctx, kind);
    if (kind.area === 'admin-api') return await adminApi(request, ctx, kind.path);
    const route = routeOf(kind.path);
    if (route.kind === 'meta') return await allowRead(request, () => json({ apiVersion: API_VERSION, schemaVersion: SCHEMA_VERSION, actions: ACTION_NAMES }));
    if (route.kind === 'state') return await allowRead(request, async () => json(await ctx.board.read()));
    if (route.kind === 'events') return await allowRead(request, () => subscribe(request, ctx));
    if (route.kind === 'session') return await allowRead(request, () => sessionStatus(request, ctx));
    if (route.kind === 'login') return await postOnly(request, () => login(request, ctx));
    if (route.kind === 'logout') return await postOnly(request, () => logout(request, ctx));
    if (route.kind === 'action') return await postOnly(request, () => action(request, ctx));
    if (route.kind === 'api-missing') return json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }, 404);
    if (kind.path === '/') return redirect(`${ctx.basePath || ''}/control.html`);
    return serveAsset(request, kind.path, ctx);
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
  return json({ authenticated: Boolean(actor), user: actor || '', users: await ctx.codes.names() });
}

async function login(request, ctx) {
  assertMutatingRequest(request);
  if (!ctx.sessionSecret) throw new DomainError('NOT_CONFIGURED', 'KartBoard has no session secret yet.', 503);
  if (!(await ctx.codes.configured())) throw new DomainError('NOT_CONFIGURED', 'No controller codes are registered yet.', 503);
  const body = await readJson(request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const rawCode = typeof body.code === 'string' && body.code ? body.code : (typeof body.pin === 'string' ? body.pin : '');
  const ip = clientIp(request, ctx);
  const attemptUser = await codeAttemptKey(name, rawCode);
  const gate = ctx.rateLimit.attempt({ ip, user: attemptUser });
  if (!gate.ok) return rateLimited(gate.retryAfterMs);
  const credential = await ctx.codes.authenticate({ name, code: rawCode });
  if (!credential) throw new DomainError('INVALID_CODE', 'That code was not recognised.', 401);
  ctx.rateLimit.succeed({ ip, user: attemptUser });
  await ctx.codes.markUsed(credential.id, ctx.now());
  const token = await signSession({
    u: credential.name,
    id: credential.id,
    v: credential.version,
    exp: ctx.now() + SESSION_TTL_MS
  }, ctx.sessionSecret);
  return json({ ok: true, user: credential.name }, 200, { 'Set-Cookie': sessionCookie(token, cookieOptions(request, ctx)) });
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

async function adminApi(request, ctx, pathname) {
  const route = adminRoute(pathname, request.method);
  if (!route.known) return json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }, 404);
  if (!route.action) return methodNotAllowed(Object.keys(route.allowed || { POST: true }).join(', ') || 'POST');
  const auth = await authorizeAdmin(request, ctx);
  if (!auth.ok) throw new DomainError(auth.code, auth.message, auth.status);
  if (route.action === 'list') return json({ codes: await ctx.codes.listPublic() });
  assertMutatingRequest(request);
  const body = await readJson(request);
  const now = ctx.now();
  if (route.action === 'create') return json(await ctx.codes.create(body.name, now), 201);
  if (route.action === 'revoke') return json(await ctx.codes.revoke(body.name));
  if (route.action === 'regenerate') return json(await ctx.codes.regenerate(body.name, now));
  return json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }, 404);
}

async function serveAdminAsset(request, ctx, kind) {
  if (kind.redirect) return redirect(kind.redirect);
  if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed('GET, HEAD');
  if ((ctx.adminMode || 'local') === 'access') {
    const auth = await authorizeHostedAdmin(request, ctx.adminEnv || {}, ctx.adminDeps || {});
    if (!auth.ok) throw new DomainError(auth.code, auth.message, auth.status);
  }
  return serveAsset(request, kind.path, ctx);
}

function authorizeAdmin(request, ctx) {
  if ((ctx.adminMode || 'local') === 'access') return authorizeHostedAdmin(request, ctx.adminEnv || {}, ctx.adminDeps || {});
  return authorizeLocalAdmin(request, ctx);
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
  if (!payload) return null;
  return ctx.codes.resolveSession(payload);
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
  const textBody = await request.text();
  if (new TextEncoder().encode(textBody).length > MAX_BODY_BYTES) throw new DomainError('REQUEST_TOO_LARGE', 'Request body is too large.', 413);
  if (!textBody) return {};
  try { return JSON.parse(textBody); }
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
