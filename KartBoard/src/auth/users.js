const { bytesToBase64, base64ToBytes, timingSafeEqual } = require('./bytes');

const DEFAULT_ITERATIONS = 100_000;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 500_000;
const PIN_PATTERN = /^[0-9]{4,8}$/;

/**
 * @param {string} pin
 * @param {{ salt?: Uint8Array, iterations?: number, name?: string }} [options]
 */
function hashPin(pin, options = {}) {
  return hashSecret(pin, options);
}

function normalizeIterations(value) {
  const iterations = Number(value);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null;
  return iterations;
}

function pbkdf2(secret, salt, iterations) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']).then(key => (
    crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256).then(bits => new Uint8Array(bits))
  ));
}

/**
 * @param {string} secret
 * @param {{ salt?: Uint8Array, iterations?: number, name?: string }} [options]
 */
async function hashSecret(secret, options = {}) {
  const iterations = normalizeIterations(options.iterations) || DEFAULT_ITERATIONS;
  const salt = options.salt || crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(secret, salt, iterations);
  return {
    name: typeof options.name === 'string' ? options.name.trim() : '',
    salt: bytesToBase64(salt),
    hash: bytesToBase64(bits),
    iterations
  };
}

/**
 * Always runs PBKDF2, including when `user` is missing, so a lookup miss is not faster.
 * @param {string} secret
 * @param {{ salt?: string, hash?: string, iterations?: number } | null | undefined} user
 */
async function verifySecret(secret, user) {
  const iterations = user?.iterations || DEFAULT_ITERATIONS;
  const salt = user?.salt ? base64ToBytes(user.salt) : new Uint8Array(16);
  const actual = await pbkdf2(String(secret ?? ''), salt, iterations);
  if (!user || typeof user.hash !== 'string') return false;
  return timingSafeEqual(actual, base64ToBytes(user.hash));
}

class UserRegistry {
  /** @param {Array<{ name?: string, salt?: string, hash?: string, iterations?: number }>} users */
  constructor(users = []) {
    this.users = users.map(normalizeUser).filter(Boolean);
  }

  static fromJson(text) {
    if (!text || !String(text).trim()) return new UserRegistry([]);
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error('KartBoard user file is not valid JSON.'); }
    const list = Array.isArray(parsed) ? parsed : parsed?.users;
    if (!Array.isArray(list)) throw new Error('KartBoard user file must contain a users array.');
    return new UserRegistry(list);
  }

  static fromList(users) { return new UserRegistry(users || []); }

  get names() { return this.users.map(user => user.name); }
  get configured() { return this.users.length > 0; }
  has(name) { return this.users.some(user => user.name === name); }

  /**
   * @param {string} name
   * @param {string} pin
   * @returns {Promise<string | null>}
   */
  async authenticate(name, pin) {
    const user = this.users.find(item => item.name === name);
    const matches = await verifySecret(pin, user);
    if (!user || !PIN_PATTERN.test(pin)) return null;
    return matches ? user.name : null;
  }
}

function normalizeUser(user) {
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  const iterations = normalizeIterations(user?.iterations);
  if (!name || name.length > 40 || !iterations || typeof user.salt !== 'string' || typeof user.hash !== 'string') return null;
  return { name, salt: user.salt, hash: user.hash, iterations };
}

function assertPin(pin) {
  if (!PIN_PATTERN.test(pin)) throw new Error('PIN must be 4 to 8 digits.');
}

function assertName(name) {
  const clean = name.trim();
  if (!clean || clean.length > 40 || /[\u0000-\u001f]/.test(clean)) throw new Error('Name must be 1 to 40 visible characters.');
  return clean;
}

module.exports = {
  DEFAULT_ITERATIONS, PIN_PATTERN, hashPin, hashSecret, verifySecret, normalizeIterations, UserRegistry, assertPin, assertName
};
