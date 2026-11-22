function normalizeBase(basePath) {
  if (!basePath || basePath === '/') return '';
  const withSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withSlash.replace(/\/+$/, '');
}

function locate(pathname, basePath) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return { error: 'invalid' }; }
  if (decoded.includes('\0') || decoded.includes('\\')) return { error: 'invalid' };
  const base = normalizeBase(basePath);
  let path = decoded || '/';
  if (base) {
    if (path === base) path = '/';
    else if (path.startsWith(`${base}/`)) path = path.slice(base.length) || '/';
    else return { error: 'outside' };
  }
  if (!path.startsWith('/')) path = `/${path}`;
  const parts = path.split('/');
  if (parts.some(part => part === '..' || part === '.')) return { error: 'invalid' };
  return { path };
}

module.exports = { normalizeBase, locate };
