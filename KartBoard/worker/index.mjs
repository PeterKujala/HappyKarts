import FILES from './assets.generated.mjs';
import { KartBoardRoom } from './room.mjs';
import { HOSTED_BASE_PATH, SECURITY_HEADERS } from '../src/http/constants.js';
import { locate } from '../src/http/paths.js';

export { KartBoardRoom };

export default {
  /**
   * @param {Request} request
   * @param {{ KARTBOARD: { idFromName: (name: string) => unknown, get: (id: unknown) => { fetch: (request: Request) => Promise<Response> } } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const located = locate(url.pathname, HOSTED_BASE_PATH);
    if (located.error === 'outside') return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
    if (located.error || !located.path) return jsonError('NOT_FOUND', 'File not found.', 404);
    if (located.path === '/api' || located.path.startsWith('/api/')) {
      if (!env?.KARTBOARD) return new Response('KartBoard storage is not configured.', { status: 500, headers: SECURITY_HEADERS });
      const id = env.KARTBOARD.idFromName('practice-day');
      return env.KARTBOARD.get(id).fetch(request);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return jsonError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, { Allow: 'GET, HEAD' });
    if (located.path === '/') return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: `${HOSTED_BASE_PATH}/control.html` } });
    const file = FILES[`${HOSTED_BASE_PATH}${located.path}`];
    if (!file) return jsonError('NOT_FOUND', 'File not found.', 404);
    const headers = { ...SECURITY_HEADERS, 'content-type': file.type, 'cache-control': 'no-cache' };
    return new Response(request.method === 'HEAD' ? null : file.body, { status: 200, headers });
  }
};

function jsonError(code, message, status, extra = {}) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}
