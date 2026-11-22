const fs = require('fs');
const crypto = require('crypto');
const { loadConfig } = require('./src/config');
const { createKartBoardServer } = require('./src/http/create-server');
const { UserRegistry } = require('./src/auth/users');
const { CONTROLLER_URL, PUBLIC_BOARD_URL } = require('./src/http/constants');

function startKartBoard() {
  const config = loadConfig();
  const sessionSecret = resolveSessionSecret(config);
  const users = loadUsers(config);
  const app = createKartBoardServer({ ...config, sessionSecret, users });
  writePidFile(config.pidFile);
  app.server.listen(config.port, config.host, () => {
    const local = `http://127.0.0.1:${config.port}`;
    console.log(`KartBoard is running at ${local}`);
    console.log(`Control: ${local}/control.html`);
    console.log(`Board:   ${local}/board.html`);
    console.log(`Hosted board:      ${PUBLIC_BOARD_URL}`);
    console.log(`Hosted controller: ${CONTROLLER_URL}`);
    if (!users.configured) console.log('No controller PINs yet. Run: node scripts/manage-users.mjs add');
    if (config.host === '0.0.0.0') console.log('Other devices on this network can connect using this computer\'s local IP address.');
  });
  return app;
}

function resolveSessionSecret(config) {
  if (config.sessionSecret) return config.sessionSecret;
  try { return fs.readFileSync(config.sessionSecretFile, 'utf8').trim(); }
  catch {
    const secret = crypto.randomBytes(32).toString('base64url');
    fs.writeFileSync(config.sessionSecretFile, `${secret}\n`, { mode: 0o600 });
    console.log('Created a local session secret at kartboard-session.secret.');
    return secret;
  }
}

function loadUsers(config) {
  if (config.usersJson) return UserRegistry.fromJson(config.usersJson);
  if (!fs.existsSync(config.usersFile)) return new UserRegistry([]);
  return UserRegistry.fromJson(fs.readFileSync(config.usersFile, 'utf8'));
}

function writePidFile(pidFile) {
  fs.writeFileSync(pidFile, String(process.pid), 'utf8');
  const removeOwnPid = () => {
    try {
      if (fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) fs.unlinkSync(pidFile);
    } catch { /* already gone */ }
  };
  process.once('exit', removeOwnPid);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { removeOwnPid(); process.exit(0); });
  }
}

if (require.main === module) startKartBoard();

module.exports = { startKartBoard, createKartBoardServer };
