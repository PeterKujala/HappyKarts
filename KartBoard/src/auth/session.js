const { SESSION_COOKIE, SESSION_TTL_MS } = require('../http/constants');
const { bytesToBase64Url, base64UrlToBytes, timingSafeEqual } = require('./bytes');

async function signSession(payload, secret) {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(secret, body);
  return `${body}.${bytesToBase64Url(signature)}`;
}

async function verifySession(token, secret, now) {
  if (!token || !secret || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = await hmac(secret, body);
  let provided;
  try { provided = base64UrlToBytes(signature); }
  catch { return null; }
  if (!timingSafeEqual(expected, provided)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))); }
  catch { return null; }
  if (!payload || typeof payload.u !== 'string' || !payload.u || typeof payload.exp !== 'number') return null;
  if (payload.exp <= now) return null;
  return payload;
}

function sessionCookie(token, { basePath = '', secure = false, maxAge = Math.floor(SESSION_TTL_MS / 1000) } = {}) {
  return serializeCookie(token, { basePath, secure, maxAge });
}

function clearSessionCookie({ basePath = '', secure = false } = {}) {
  return serializeCookie('', { basePath, secure, maxAge: 0 });
}

function readCookie(header, name = SESSION_COOKIE) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return '';
}

function serializeCookie(value, { basePath, secure, maxAge }) {
  const parts = [`${SESSION_COOKIE}=${value}`, 'HttpOnly', 'SameSite=Strict', `Path=${basePath || '/'}`, `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function hmac(secret, text) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))
    .then(signature => new Uint8Array(signature));
}

module.exports = { signSession, verifySession, sessionCookie, clearSessionCookie, readCookie, SESSION_TTL_MS };
