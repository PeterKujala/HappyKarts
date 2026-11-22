const fs = require('fs');
const path = require('path');
const { normalizeIterations } = require('../auth/users');

function normalizeRecords(raw) {
  const list = Array.isArray(raw) ? raw : raw?.codes;
  if (!Array.isArray(list)) return [];
  return list.map(normalizeRecord).filter(Boolean);
}

function normalizeRecord(record) {
  const name = typeof record?.name === 'string' ? record.name.trim() : '';
  const iterations = normalizeIterations(record?.iterations);
  const version = Number(record?.version);
  if (!name || name.length > 40 || !iterations || !Number.isInteger(version) || version < 1) return null;
  if (typeof record.id !== 'string' || !record.id || typeof record.salt !== 'string' || typeof record.hash !== 'string') return null;
  const sealed = typeof record.codeIv === 'string' && record.codeIv && typeof record.codeCipher === 'string' && record.codeCipher
    ? { codeIv: record.codeIv, codeCipher: record.codeCipher }
    : {};
  return {
    id: record.id,
    name,
    salt: record.salt,
    hash: record.hash,
    iterations,
    version,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
    lastUsedAt: typeof record.lastUsedAt === 'number' ? record.lastUsedAt : null,
    ...sealed
  };
}

class MemoryAccessCodeStore {
  constructor(records = []) {
    this.records = normalizeRecords(records);
  }

  async load() {
    return structuredClone(this.records);
  }

  async save(records) {
    this.records = normalizeRecords(records);
  }
}

class FileAccessCodeStore {
  /**
   * @param {string} filePath
   * @param {{ logger?: { warn?: (message?: string) => void } }} [options]
   */
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.logger = options.logger || console;
  }

  async load() {
    try { return normalizeRecords(JSON.parse(fs.readFileSync(this.filePath, 'utf8'))); }
    catch (error) {
      if (error?.code === 'ENOENT') return [];
      this.logger.warn?.(`Could not read access codes: ${error.message}`);
      throw error;
    }
  }

  async save(records) {
    const clean = normalizeRecords(records);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify({ codes: clean }, null, 2)}\n`, { mode: 0o600 });
    try { fs.renameSync(temp, this.filePath); }
    catch {
      fs.copyFileSync(temp, this.filePath);
      fs.unlinkSync(temp);
    }
  }
}

class DurableAccessCodeStore {
  /**
   * @param {{ get: (key: string) => Promise<unknown>, put: (key: string, value: unknown) => Promise<void> }} storage
   * @param {string} [key]
   */
  constructor(storage, key = 'accessCodes') {
    this.storage = storage;
    this.key = key;
  }

  async load() {
    return normalizeRecords(await this.storage.get(this.key));
  }

  async save(records) {
    await this.storage.put(this.key, { codes: normalizeRecords(records) });
  }
}

module.exports = { normalizeRecords, MemoryAccessCodeStore, FileAccessCodeStore, DurableAccessCodeStore };
