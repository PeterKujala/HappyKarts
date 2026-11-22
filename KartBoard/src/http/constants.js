const API_VERSION = 2;
const HOSTED_BASE_PATH = '/auth/apps/kartboard';
const ADMIN_BASE_PATH = '/auth/apps/kartboard-admin';
const PUBLIC_BOARD_URL = 'https://designacle.au/auth/apps/kartboard/board.html';
const CONTROLLER_URL = 'https://designacle.au/auth/apps/kartboard/control.html';
const ADMIN_URL = 'https://designacle.au/auth/apps/kartboard-admin/admin.html';
const ACCESS_TEAM_DOMAIN = 'designacle.cloudflareaccess.com';
const CONTROLLER_HEADER = 'x-kartboard-request';
const CONTROLLER_HEADER_VALUE = '1';
const SESSION_COOKIE = 'kartboard_session';
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 100_000;
const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'",
  'X-Robots-Tag': 'noindex, nofollow'
});

module.exports = {
  API_VERSION, HOSTED_BASE_PATH, ADMIN_BASE_PATH, PUBLIC_BOARD_URL, CONTROLLER_URL, ADMIN_URL, ACCESS_TEAM_DOMAIN,
  CONTROLLER_HEADER, CONTROLLER_HEADER_VALUE, SESSION_COOKIE, SESSION_TTL_MS, MAX_BODY_BYTES, SECURITY_HEADERS
};
