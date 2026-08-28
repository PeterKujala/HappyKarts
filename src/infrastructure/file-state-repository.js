const fs = require('fs');
const path = require('path');
const { createDefaultState, migrateState } = require('../domain/state');

class FileStateRepository {
  constructor(filePath, { logger = console, now = Date.now } = {}) {
    this.filePath = filePath;
    this.backupPath = `${filePath}.backup`;
    this.tempPath = `${filePath}.tmp`;
    this.logger = logger;
    this.now = now;
  }

  load() {
    const primary = this.#read(this.filePath);
    if (primary) return migrateState(primary, this.now());
    const backup = this.#read(this.backupPath);
    if (backup) {
      this.logger.warn?.('KartBoard recovered state from the backup file.');
      return migrateState(backup, this.now());
    }
    return createDefaultState(this.now());
  }

  save(state) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      try { fs.copyFileSync(this.filePath, this.backupPath); }
      catch (error) { this.logger.warn?.(`Could not update state backup: ${error.message}`); }
    }
    fs.writeFileSync(this.tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    try { fs.renameSync(this.tempPath, this.filePath); }
    catch { fs.copyFileSync(this.tempPath, this.filePath); fs.unlinkSync(this.tempPath); }
  }

  #read(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') this.logger.warn?.(`Could not read ${path.basename(filePath)}: ${error.message}`);
      return null;
    }
  }
}

module.exports = { FileStateRepository };
