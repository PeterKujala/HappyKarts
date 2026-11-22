const { FileStateRepository } = require('../infrastructure/file-state-repository');
const { FileAccessCodeStore, MemoryAccessCodeStore } = require('../infrastructure/access-code-store');
const { SseHub } = require('../infrastructure/sse-hub');
const { BoardCoordinator } = require('./coordinator');
const { UserRegistry } = require('../auth/users');
const { CredentialBook } = require('../auth/codes');
const { RateLimiter } = require('../auth/rate-limit');
const { readPublicAsset } = require('../http/assets');
const { handleKartBoardRequest } = require('../http/handle-request');

function createKartBoardApp(options = {}) {
  const now = options.now || Date.now;
  const events = options.events || new SseHub(options.sse);
  const repository = options.repository || new FileStateRepository(options.stateFile, { logger: options.logger, now });
  const board = new BoardCoordinator({ repository, events, now });
  const users = options.users instanceof UserRegistry ? options.users : UserRegistry.fromList(options.users || []);
  const rateLimit = options.rateLimit || new RateLimiter({ now });
  const accessCodes = options.accessCodes || (
    options.accessCodesFile
      ? new FileAccessCodeStore(options.accessCodesFile, { logger: options.logger })
      : new MemoryAccessCodeStore()
  );
  const codes = options.codes || new CredentialBook({
    seeds: users,
    store: accessCodes,
    iterations: options.codeIterations,
    codeKey: options.codeKey || '',
    sessionSecret: options.sessionSecret || ''
  });
  const ctx = {
    basePath: options.basePath || '',
    adminBasePath: options.adminBasePath === undefined ? (options.basePath || '') : options.adminBasePath,
    adminMode: options.adminMode || 'local',
    adminToken: options.adminToken || '',
    adminEnv: options.adminEnv || {},
    adminDeps: options.adminDeps || {},
    board,
    events,
    users,
    codes,
    rateLimit,
    sessionSecret: options.sessionSecret || '',
    now,
    asset: pathname => options.asset ? options.asset(pathname) : readPublicAsset(options.publicDir, pathname),
    clientIp: options.clientIp || (request => request.headers.get('x-kartboard-client-ip') || 'unknown'),
    logger: options.logger || console
  };
  return {
    board,
    events,
    users,
    rateLimit,
    handle: request => handleKartBoardRequest(request, ctx),
    close: () => events.close()
  };
}

module.exports = { createKartBoardApp };
