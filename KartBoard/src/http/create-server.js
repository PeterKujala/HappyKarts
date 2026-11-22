const http = require('http');
const { once } = require('events');
const { DomainError } = require('../domain/errors');
const { MAX_BODY_BYTES, API_VERSION } = require('./constants');
const { createKartBoardApp } = require('../application/create-app');

function createKartBoardServer(options = {}) {
  const app = createKartBoardApp(options);
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      const request = toWebRequest(req, body);
      const response = await app.handle(request);
      await writeWebResponse(res, response);
    } catch (error) {
      if (res.writableEnded) return;
      const status = error instanceof DomainError ? error.status : error?.code === 'REQUEST_TOO_LARGE' ? 413 : 500;
      const code = error instanceof DomainError ? error.code : error?.code === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INTERNAL_ERROR';
      const message = error instanceof DomainError || error?.code === 'REQUEST_TOO_LARGE' ? (error.message || 'Request body is too large.') : 'KartBoard could not complete the request.';
      const payload = JSON.stringify({ error: { code, message } });
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    }
  });
  return {
    server,
    app,
    getState: () => app.board.read(),
    close: () => new Promise((resolve, reject) => {
      app.close();
      server.close(error => error ? reject(error) : resolve());
    })
  };
}

function readBody(req) {
  if (['GET', 'HEAD'].includes(req.method || 'GET')) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        reject(Object.assign(new Error('Request body is too large.'), { code: 'REQUEST_TOO_LARGE', status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!settled) resolve(Buffer.concat(chunks)); });
    req.on('error', error => { if (!settled) { settled = true; reject(error); } });
  });
}

function toWebRequest(req, body) {
  const host = req.headers.host || '127.0.0.1';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || ['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive'].includes(key)) continue;
    if (key === 'x-kartboard-client-ip') continue;
    if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
    else headers.set(key, value);
  }
  headers.set('x-kartboard-client-ip', normalizeAddress(req.socket?.remoteAddress));
  const method = req.method || 'GET';
  const init = { method, headers };
  if (body) init.body = body;
  return new Request(`http://${host}${req.url}`, init);
}

async function writeWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length) res.setHeader('set-cookie', cookies.length === 1 ? cookies[0] : cookies);
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await once(res, 'drain');
    }
    res.end();
  } catch (error) {
    res.destroy(error);
  }
}

function normalizeAddress(address) {
  const text = address || 'unknown';
  return text.startsWith('::ffff:') ? text.slice('::ffff:'.length) : text;
}

module.exports = { API_VERSION, createKartBoardServer };
