const fs = require('fs');
const path = require('path');

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
});

function readPublicAsset(publicDir, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..')) return null;
  const filePath = path.resolve(publicDir, relative);
  const fromRoot = path.relative(publicDir, filePath);
  if (!fromRoot || fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return null;
  let stat;
  try { stat = fs.statSync(filePath); }
  catch { return null; }
  if (!stat.isFile()) return null;
  return {
    body: fs.readFileSync(filePath),
    type: MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    size: stat.size
  };
}

module.exports = { MIME_TYPES, readPublicAsset };
