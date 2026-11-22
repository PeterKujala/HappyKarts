// Cloudflare Access JWT check for KartBoard admin.
//
// Access sits in front of designacle.au/auth/apps/* and adds
// Cf-Access-Jwt-Assertion. Admin verifies that token with the team JWKS
// (https://<team>/cdn-cgi/access/certs). The team domain defaults to
// designacle.cloudflareaccess.com. The audience (AUD) comes from ACCESS_AUD.
// If ACCESS_AUD is missing, admin fails closed: a spoofed email header is not enough.
// The Cf-Access-Authenticated-User-Email header is only accepted when it matches the token.
// ADMIN_EMAILS, when set, is a comma-separated allow-list. An invalid value fails closed.

const { ACCESS_TEAM_DOMAIN } = require('../http/constants');
const { timingSafeEqualText } = require('./bytes');

/** @param {string} value */
function b64uToBytes(value) {
  const clean = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const pad = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(pad);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

/** @param {string} part */
function decodeJson(part) {
  return JSON.parse(new TextDecoder().decode(b64uToBytes(part)));
}

/** @type {{ at: number, team: string, keys: Array<{ kid?: string }> | null }} */
let cache = { at: 0, team: '', keys: null };
const CERT_TTL_MS = 60 * 60 * 1000;
const encoder = new TextEncoder();

/** @param {string} team hostname, no scheme */
async function fetchAccessCerts(team) {
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`Access certs HTTP ${response.status}`);
  const body = await response.json();
  return body.keys ?? [];
}

function accessTeam(env) {
  return String(env?.ACCESS_TEAM_DOMAIN || ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Verify an Access JWT. Throws a plain Error whose message is a short reason.
 * `fetchCerts(team)` supplies the JWKS in tests.
 * @param {string} token
 * @param {{ team: string, aud: string, now?: number, fetchCerts?: (team: string) => Promise<object[]> }} opts
 */
async function verifyAccessJwt(token, opts) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error('malformed');
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (header.alg !== 'RS256') throw new Error('alg');
  const now = opts.now ?? Date.now();
  const load = opts.fetchCerts ?? fetchAccessCerts;
  let keys = cache.team === opts.team && cache.keys && now - cache.at < CERT_TTL_MS ? cache.keys : null;
  if (!keys) {
    keys = await load(opts.team);
    cache = { at: now, team: opts.team, keys };
  }
  const jwk = keys.find(key => key.kid && key.kid === header.kid);
  if (!jwk) throw new Error('no key');
  const key = await crypto.subtle.importKey('jwk', /** @type {JsonWebKey} */ (jwk), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('signature');
  if (payload.iss !== `https://${opts.team}`) throw new Error('iss');
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(opts.aud)) throw new Error('aud');
  const seconds = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= seconds) throw new Error('exp');
  if (typeof payload.nbf === 'number' && payload.nbf > seconds + 60) throw new Error('nbf');
  return payload;
}

/**
 * @param {Request} request
 * @param {{ ACCESS_TEAM_DOMAIN?: string, ACCESS_AUD?: string }} env
 * @param {{ now?: number, fetchCerts?: (team: string) => Promise<object[]> }} [deps]
 * @returns {Promise<{ email: string } | { email: '', status: number, error: string }>}
 */
async function verifyAccessRequest(request, env, deps = {}) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('cf-access-jwt-assertion');
  if (!token) return { email: '', status: 401, error: 'Not signed in (Cloudflare Access)' };
  const team = accessTeam(env);
  const aud = String(env?.ACCESS_AUD ?? '');
  if (!team || !aud) return { email: '', status: 401, error: 'Cloudflare Access is not configured on this Worker' };
  try {
    const payload = await verifyAccessJwt(token, { team, aud, now: deps.now, fetchCerts: deps.fetchCerts });
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    if (!email) return { email: '', status: 401, error: 'Not signed in (Cloudflare Access)' };
    const headerEmail = request.headers.get('Cf-Access-Authenticated-User-Email') || request.headers.get('cf-access-authenticated-user-email');
    if (headerEmail && headerEmail.trim().toLowerCase() !== email.toLowerCase()) {
      return { email: '', status: 401, error: 'Not signed in (Cloudflare Access)' };
    }
    return { email };
  } catch (error) {
    console.warn('access jwt', error instanceof Error ? error.message : String(error));
    return { email: '', status: 401, error: 'Not signed in (Cloudflare Access)' };
  }
}

function parseAdminEmails(value) {
  const raw = String(value ?? '');
  if (!raw.trim()) return { enforce: false, emails: [], misconfigured: false };
  const emails = raw.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  const valid = emails.length > 0 && emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (!valid) return { enforce: true, emails: [], misconfigured: true };
  return { enforce: true, emails, misconfigured: false };
}

/**
 * @param {Request} request
 * @param {{ ACCESS_TEAM_DOMAIN?: string, ACCESS_AUD?: string, ADMIN_EMAILS?: string }} env
 * @param {{ now?: number, fetchCerts?: (team: string) => Promise<object[]> }} [deps]
 */
async function authorizeHostedAdmin(request, env, deps = {}) {
  const result = await verifyAccessRequest(request, env || {}, deps);
  if (!result.email) {
    const failure = /** @type {{ status?: number, error?: string }} */ (result);
    const notConfigured = /not configured/i.test(failure.error || '');
    return {
      ok: false,
      status: failure.status || 401,
      code: notConfigured ? 'ADMIN_NOT_CONFIGURED' : 'ACCESS_REQUIRED',
      message: failure.error || 'Not signed in (Cloudflare Access)'
    };
  }
  const allow = parseAdminEmails(env?.ADMIN_EMAILS);
  if (allow.misconfigured) {
    return { ok: false, status: 401, code: 'ADMIN_NOT_CONFIGURED', message: 'ADMIN_EMAILS is not a comma-separated list of emails.' };
  }
  if (allow.enforce && !allow.emails.includes(result.email.toLowerCase())) {
    return { ok: false, status: 403, code: 'ADMIN_FORBIDDEN', message: 'This Cloudflare Access account cannot manage KartBoard codes.' };
  }
  return { ok: true, email: result.email };
}

function readBearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : '';
}

function isLoopback(ip) {
  const text = String(ip || '');
  return text === '127.0.0.1' || text === '::1' || text === 'localhost';
}

/**
 * Local admin is open on loopback only, unless KARTBOARD_ADMIN_TOKEN is set.
 * A configured token is required from every address, including loopback.
 * @param {Request} request
 * @param {{ adminToken?: string, clientIp?: (request: Request) => string }} ctx
 */
function authorizeLocalAdmin(request, ctx) {
  const token = ctx.adminToken || '';
  const presented = readBearer(request);
  if (token) {
    if (presented && timingSafeEqualText(presented, token)) return { ok: true, email: 'local-admin' };
    return { ok: false, status: 401, code: 'ADMIN_REQUIRED', message: 'KartBoard admin needs the local admin token.' };
  }
  const ip = ctx.clientIp ? ctx.clientIp(request) : 'unknown';
  if (isLoopback(ip)) return { ok: true, email: 'localhost' };
  return {
    ok: false,
    status: 401,
    code: 'ADMIN_REQUIRED',
    message: 'KartBoard admin is only open on this computer. Set KARTBOARD_ADMIN_TOKEN to use it from another device.'
  };
}

function clearCertCache() {
  cache = { at: 0, team: '', keys: null };
}

module.exports = {
  fetchAccessCerts, verifyAccessJwt, verifyAccessRequest, authorizeHostedAdmin, authorizeLocalAdmin, parseAdminEmails, clearCertCache, isLoopback
};
