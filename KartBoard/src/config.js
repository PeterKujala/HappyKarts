const path = require('path');
const { normalizeBase } = require('./http/paths');

const ROOT_DIR = path.resolve(__dirname, '..');

function loadConfig(env = process.env) {
  return Object.freeze({
    host: env.KARTBOARD_HOST || '0.0.0.0',
    port: parsePort(env.KARTBOARD_PORT, 4317),
    publicDir: path.join(ROOT_DIR, 'public'),
    stateFile: env.KARTBOARD_STATE_FILE || path.join(ROOT_DIR, 'kartboard-state.json'),
    pidFile: env.KARTBOARD_PID_FILE || path.join(ROOT_DIR, 'kartboard.pid'),
    basePath: normalizeBase(env.KARTBOARD_BASE_PATH || ''),
    usersFile: env.KARTBOARD_USERS_FILE || path.join(ROOT_DIR, 'kartboard-users.json'),
    accessCodesFile: env.KARTBOARD_ACCESS_CODES_FILE || path.join(ROOT_DIR, 'kartboard-access-codes.json'),
    sessionSecretFile: env.KARTBOARD_SESSION_SECRET_FILE || path.join(ROOT_DIR, 'kartboard-session.secret'),
    usersJson: env.KARTBOARD_USERS || '',
    sessionSecret: env.KARTBOARD_SESSION_SECRET || '',
    codeKey: env.KARTBOARD_CODE_KEY || '',
    adminToken: env.KARTBOARD_ADMIN_TOKEN || ''
  });
}

function parsePort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid KARTBOARD_PORT: ${value}`);
  return port;
}

module.exports = { ROOT_DIR, loadConfig, parsePort };
