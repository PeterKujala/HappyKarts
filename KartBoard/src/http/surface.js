const { normalizeBase, locate } = require('./paths');

/**
 * Decide whether a URL is the public board, the Access-protected admin surface, or neither.
 * Admin API and pages on the public prefix are not served. `/admin.html` there only redirects.
 * @param {string} pathname
 * @param {{ basePath?: string, adminBasePath?: string }} [options]
 */
function classify(pathname, { basePath = '', adminBasePath = basePath } = {}) {
  const appBase = normalizeBase(basePath);
  const adminBase = normalizeBase(adminBasePath);
  const dedicated = adminBase !== appBase;
  const admin = locate(pathname, adminBase);
  if (!admin.error && admin.path) {
    const path = admin.path;
    if (dedicated && path === '/') return surface('admin', '/admin.html', `${adminBase}/admin.html`);
    if (path === '/admin.html' || path === '/admin.js') return surface('admin', path);
    if (dedicated && path === '/styles.css') return surface('admin', path);
    if (path === '/api/admin' || path.startsWith('/api/admin/')) return surface('admin-api', path);
    if (dedicated) return surface('missing', '');
  }
  const app = locate(pathname, appBase);
  if (app.error || !app.path) return surface('missing', '', '', app.error || 'invalid');
  if (dedicated && app.path === '/admin.html') return surface('admin-redirect', '/admin.html', `${adminBase}/admin.html`);
  if (dedicated && (app.path === '/admin.js' || app.path === '/api/admin' || app.path.startsWith('/api/admin/'))) return surface('missing', '');
  return surface('app', app.path);
}

function surface(area, path, redirect = '', error = '') {
  return { area, path, redirect, error };
}

const ADMIN_ROUTES = Object.freeze({
  '/api/admin/codes': Object.freeze({ GET: 'list', HEAD: 'list', POST: 'create' }),
  '/api/admin/codes/revoke': Object.freeze({ POST: 'revoke' }),
  '/api/admin/codes/regenerate': Object.freeze({ POST: 'regenerate' })
});

function adminRoute(pathname, method) {
  const routes = ADMIN_ROUTES[pathname];
  if (!routes) return { known: false, action: '', allowed: {} };
  return { known: true, action: routes[method] || '', allowed: routes };
}

module.exports = { classify, adminRoute, ADMIN_ROUTES };
