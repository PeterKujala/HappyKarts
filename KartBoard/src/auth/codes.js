const { DomainError } = require('../domain/errors');
const { assertName, hashSecret, verifySecret, DEFAULT_ITERATIONS } = require('./users');

// 32 characters, so a random byte maps evenly (256 / 32). Dropped 0/o/1/l.
const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;
const CODE_PATTERN = /^[a-z0-9]{4,32}$/;

function normalizeAccessCode(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * @param {(bytes: Uint8Array) => Uint8Array | void} [fill]
 */
function generateAccessCode(fill = bytes => crypto.getRandomValues(bytes)) {
  const bytes = new Uint8Array(CODE_LENGTH);
  fill(bytes);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

function hashAccessCode(code, options = {}) {
  const normalized = normalizeAccessCode(code);
  if (!CODE_PATTERN.test(normalized)) throw new Error('Access code must be 4 to 32 letters or digits.');
  return hashSecret(normalized, options);
}

async function codeAttemptKey(name, code) {
  const cleanName = String(name || '').trim();
  if (cleanName) return cleanName;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeAccessCode(code)));
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `code:${hex.slice(0, 12)}`;
}

function cleanName(name) {
  try { return assertName(String(name || '')); }
  catch (error) { throw new DomainError('INVALID_NAME', error.message || 'Name was not accepted.', 400); }
}

function publicCode(credential) {
  return {
    id: credential.id,
    name: credential.name,
    createdAt: credential.createdAt,
    lastUsedAt: credential.lastUsedAt,
    source: credential.source
  };
}

function seedCredential(user) {
  return {
    id: `seed:${user.name}`,
    name: user.name,
    salt: user.salt,
    hash: user.hash,
    iterations: user.iterations,
    version: 0,
    createdAt: null,
    lastUsedAt: null,
    source: 'seed'
  };
}

class CredentialBook {
  /**
   * @param {{ seeds: { users: Array<{ name: string, salt: string, hash: string, iterations: number }>, configured: boolean }, store: { load: () => Promise<object[]>, save: (records: object[]) => Promise<void> }, iterations?: number }} options
   */
  constructor({ seeds, store, iterations = DEFAULT_ITERATIONS }) {
    this.seeds = seeds;
    this.store = store;
    this.iterations = iterations;
  }

  async merged() {
    const stored = await this.store.load();
    const byName = new Map();
    for (const user of this.seeds.users) byName.set(user.name, seedCredential(user));
    for (const record of stored) byName.set(record.name, { ...record, source: 'managed' });
    return [...byName.values()];
  }

  async names() {
    return (await this.merged()).map(credential => credential.name);
  }

  async configured() {
    if (this.seeds.configured) return true;
    return (await this.store.load()).length > 0;
  }

  async listPublic() {
    const credentials = await this.merged();
    credentials.sort((left, right) => left.name.localeCompare(right.name));
    return credentials.map(publicCode);
  }

  async create(name, now) {
    const clean = cleanName(name);
    const records = await this.store.load();
    if (records.some(record => record.name === clean)) {
      throw new DomainError('CODE_EXISTS', 'That name already has a code. Generate a new one instead.', 409);
    }
    const code = generateAccessCode();
    const hashed = await hashAccessCode(code, { name: clean, iterations: this.iterations });
    const record = {
      id: crypto.randomUUID(),
      name: clean,
      salt: hashed.salt,
      hash: hashed.hash,
      iterations: hashed.iterations,
      version: 1,
      createdAt: now,
      lastUsedAt: null
    };
    records.push(record);
    await this.store.save(records);
    return { code, ...publicCode({ ...record, source: 'managed' }) };
  }

  async revoke(name) {
    const clean = cleanName(name);
    const records = await this.store.load();
    const next = records.filter(record => record.name !== clean);
    if (next.length === records.length) throw new DomainError('CODE_NOT_FOUND', 'No managed code uses that name.', 404);
    await this.store.save(next);
    return { ok: true, name: clean };
  }

  async regenerate(name, now) {
    const clean = cleanName(name);
    const records = await this.store.load();
    const index = records.findIndex(record => record.name === clean);
    if (index < 0) throw new DomainError('CODE_NOT_FOUND', 'No managed code uses that name.', 404);
    const code = generateAccessCode();
    const hashed = await hashAccessCode(code, { name: clean, iterations: this.iterations });
    const next = {
      ...records[index],
      salt: hashed.salt,
      hash: hashed.hash,
      iterations: hashed.iterations,
      version: records[index].version + 1
    };
    records[index] = next;
    await this.store.save(records);
    return { code, ...publicCode({ ...next, source: 'managed' }) };
  }

  /**
   * Name is optional. With no name, exactly one matching code is accepted.
   * @param {{ name?: string, code?: string }} input
   */
  async authenticate({ name = '', code = '' } = {}) {
    const secret = normalizeAccessCode(code);
    const credentials = await this.merged();
    if (!CODE_PATTERN.test(secret)) {
      await verifySecret(secret, null);
      return null;
    }
    const cleanNameText = String(name || '').trim();
    if (cleanNameText) {
      const credential = credentials.find(item => item.name === cleanNameText) || null;
      const matches = await verifySecret(secret, credential);
      return matches ? credential : null;
    }
    const matches = [];
    for (const credential of credentials) {
      if (await verifySecret(secret, credential)) matches.push(credential);
    }
    return matches.length === 1 ? matches[0] : null;
  }

  async resolveSession(payload) {
    if (!payload || typeof payload.id !== 'string' || !payload.id || !Number.isInteger(payload.v)) return null;
    const credentials = await this.merged();
    const credential = credentials.find(item => item.id === payload.id && item.name === payload.u && item.version === payload.v);
    return credential ? credential.name : null;
  }

  async markUsed(id, now) {
    if (!id || String(id).startsWith('seed:')) return;
    const records = await this.store.load();
    const index = records.findIndex(record => record.id === id);
    if (index < 0) return;
    records[index] = { ...records[index], lastUsedAt: now };
    await this.store.save(records);
  }
}

module.exports = {
  CODE_ALPHABET, CODE_LENGTH, CODE_PATTERN, normalizeAccessCode, generateAccessCode, hashAccessCode, codeAttemptKey, CredentialBook
};
