import FILES from './assets.generated.mjs';
import { KartBoardRoom } from './room.mjs';
import { ADMIN_BASE_PATH, HOSTED_BASE_PATH, SECURITY_HEADERS } from '../src/http/constants.js';
import { classify } from '../src/http/surface.js';
import { authorizeHostedAdmin } from '../src/auth/access.js';

export { KartBoardRoom };

export default {
  /**
   * @param {Request} request
   * @param {{ KARTBOARD?: { idFromName: (name: string) => unknown, get: (id: unknown) => { fetch: (request: Request) => Promise<Response> } }, ACCESS_AUD?: string, ACCESS_TEAM_DOMAIN?: string, ADMIN_EMAILS?: string, __fetchCerts?: (team: string) => Promise<object[]>, __accessNow?: number }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const kind = classify(url.pathname, { basePath: HOSTED_BASE_PATH, adminBasePath: ADMIN_BASE_PATH });
    if (kind.area === 'missing') return jsonError('NOT_FOUND', 'File not found.', kind.error === 'outside' ? 404 : 404);
    if (kind.area === 'admin-redirect') {
      if (!['GET', 'HEAD'].includes(request.method)) return jsonError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, { Allow: 'GET, HEAD' });
      return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: kind.redirect, 'cache-control': 'no-store' } });
    }
    if (kind.area === 'admin') {
      const auth = await authorizeHostedAdmin(request, env || {}, accessDeps(env));
      if (!auth.ok) return adminDenied(request, auth);
      if (kind.redirect) return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: kind.redirect, 'cache-control': 'no-store' } });
      return serve(request, `${ADMIN_BASE_PATH}${kind.path}`);
    }
    if (kind.area === 'admin-api') {
      const auth = await authorizeHostedAdmin(request, env || {}, accessDeps(env));
      if (!auth.ok) return adminDenied(request, auth);
    }
    if (kind.area === 'admin-api' || (kind.area === 'app' && (kind.path === '/api' || kind.path.startsWith('/api/')))) {
      if (!env?.KARTBOARD) return new Response('KartBoard storage is not configured.', { status: 500, headers: SECURITY_HEADERS });
      const id = env.KARTBOARD.idFromName('practice-day');
      return env.KARTBOARD.get(id).fetch(request);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return jsonError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, { Allow: 'GET, HEAD' });
    if (kind.path === '/') return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: `${HOSTED_BASE_PATH}/control.html` } });
    return serve(request, `${HOSTED_BASE_PATH}${kind.path}`);
  }
};

function serve(request, key) {
  const file = FILES[key];
  if (!file) return jsonError('NOT_FOUND', 'File not found.', 404);
  const headers = { ...SECURITY_HEADERS, 'content-type': file.type, 'cache-control': 'no-cache' };
  return new Response(request.method === 'HEAD' ? null : file.body, { status: 200, headers });
}

function accessDeps(env) {
  return {
    fetchCerts: typeof env?.__fetchCerts === 'function' ? env.__fetchCerts : undefined,
    now: typeof env?.__accessNow === 'number' ? env.__accessNow : undefined
  };
}

function adminDenied(request, auth) {
  const acceptsHtml = (request.headers.get('accept') || '').includes('text/html');
  if (acceptsHtml) {
    const message = escapeHtml(auth.message || 'Cloudflare Access sign-in is required.');
    const body = `<!doctype html><meta charset="utf-8"><title>KartBoard admin</title><p>${message}</p>`;
    return new Response(body, { status: auth.status || 401, headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return jsonError(auth.code || 'ACCESS_REQUIRED', auth.message || 'Not signed in (Cloudflare Access)', auth.status || 401);
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function jsonError(code, message, status, extra = {}) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}
