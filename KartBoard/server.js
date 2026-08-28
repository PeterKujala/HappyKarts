const { loadConfig } = require('./src/config');
const { createKartBoardServer } = require('./src/http/create-server');
const fs = require('fs');

function startKartBoard() {
  const config = loadConfig();
  const app = createKartBoardServer(config);
  writePidFile(config.pidFile);
  app.server.listen(config.port, config.host, () => {
    console.log(`KartBoard is running at http://127.0.0.1:${config.port}`);
    console.log(`Control: http://127.0.0.1:${config.port}/control.html`);
    console.log(`Board:   http://127.0.0.1:${config.port}/board.html`);
    if (config.host === '0.0.0.0') console.log('Other devices on this network can connect using this computer\'s local IP address.');
  });
  return app;
}

function writePidFile(pidFile) {
  fs.writeFileSync(pidFile, String(process.pid), 'utf8');
  const removeOwnPid = () => {
    try {
      if (fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) fs.unlinkSync(pidFile);
    } catch {}
  };
  process.once('exit', removeOwnPid);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { removeOwnPid(); process.exit(0); });
  }
}

if (require.main === module) startKartBoard();

module.exports = { startKartBoard, createKartBoardServer };
