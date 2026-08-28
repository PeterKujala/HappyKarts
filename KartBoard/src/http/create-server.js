const http = require('http');
const fs = require('fs');
const path = require('path');
const { DomainError } = require('../domain/errors');
const { SCHEMA_VERSION, toPublicState } = require('../domain/state');
const { ACTION_NAMES, reduceState } = require('../domain/reducer');
const { FileStateRepository } = require('../infrastructure/file-state-repository');
const { SseHub } = require('../infrastructure/sse-hub');

const API_VERSION = 2;
const MAX_BODY_BYTES = 100_000;
const MIME_TYPES = Object.freeze({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' });

function createKartBoardServer(options) {
  const logger = options.logger || console;
  const now = options.now || Date.now;
  const repository = options.repository || new FileStateRepository(options.stateFile, { logger, now });
  const events = new SseHub(options.sse);
  let state = repository.load();

  const server = http.createServer(async (req, res) => {
    setSecurityHeaders(res);
    let url;
    try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
    catch { return sendError(res, new DomainError('INVALID_URL', 'Invalid request URL.')); }

    try {
      if (url.pathname === '/api/meta' && req.method === 'GET') return sendJson(res, 200, { apiVersion: API_VERSION, schemaVersion: SCHEMA_VERSION, actions: ACTION_NAMES });
      if (url.pathname === '/api/state' && req.method === 'GET') return sendJson(res, 200, toPublicState(state));
      if (url.pathname === '/api/action' && req.method === 'POST') {
        const body = await readJson(req);
        if (Number.isInteger(body.expectedRevision) && body.expectedRevision !== state.revision) {
          throw new DomainError('REVISION_CONFLICT', 'KartBoard was changed by another controller. Refresh and try again.', 409);
        }
        state = reduceState(state, body.action, body.payload, now());
        repository.save(state);
        const publicState = toPublicState(state);
        events.publish(publicState);
        return sendJson(res, 200, publicState);
      }
      if (url.pathname === '/api/events' && req.method === 'GET') return events.subscribe(req, res, toPublicState(state));
      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
      return serveStatic(req, res, url.pathname, options.publicDir);
    } catch (error) {
      if (!(error instanceof DomainError)) logger.error?.(error);
      return sendError(res, error);
    }
  });

  return {
    server,
    getState: () => toPublicState(state),
    close: () => new Promise((resolve, reject) => {
      events.close();
      server.close(error => error ? reject(error) : resolve());
    })
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        settled = true;
        reject(new DomainError('REQUEST_TOO_LARGE', 'Request body is too large.', 413));
      }
    });
    req.on('end', () => {
      if (settled) return;
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new DomainError('INVALID_JSON', 'Request body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname, publicDir) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
  }
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { throw new DomainError('INVALID_PATH', 'Invalid path.'); }
  const relativeRequest = decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  const filePath = path.resolve(publicDir, relativeRequest);
  const relative = path.relative(publicDir, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'File not found.' } });
  let stat;
  try { stat = fs.statSync(filePath); }
  catch { return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'File not found.' } }); }
  if (!stat.isFile()) return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'File not found.' } });
  res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).on('error', error => res.destroy(error)).pipe(res);
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'");
}

function sendJson(res, status, value) {
  if (res.writableEnded) return;
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendError(res, error) {
  const status = error instanceof DomainError ? error.status : 500;
  const code = error instanceof DomainError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof DomainError ? error.message : 'KartBoard could not complete the request.';
  sendJson(res, status, { error: { code, message } });
}

module.exports = { API_VERSION, createKartBoardServer, readJson };
