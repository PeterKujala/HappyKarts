import { BoardCoordinator } from '../src/application/coordinator.js';
import { handleKartBoardRequest } from '../src/http/handle-request.js';
import { ADMIN_BASE_PATH, HOSTED_BASE_PATH } from '../src/http/constants.js';
import { DurableStateRepository } from '../src/infrastructure/durable-state-repository.js';
import { DurableAccessCodeStore } from '../src/infrastructure/access-code-store.js';
import { SseHub } from '../src/infrastructure/sse-hub.js';
import { RateLimiter } from '../src/auth/rate-limit.js';
import { UserRegistry } from '../src/auth/users.js';
import { CredentialBook } from '../src/auth/codes.js';

export class KartBoardRoom {
  /**
   * @param {{ storage: { get: (key: string) => Promise<unknown>, put: (key: string, value: unknown) => Promise<void> }, blockConcurrencyWhile?: (fn: () => Promise<void>) => Promise<void> }} ctx
   * @param {{ KARTBOARD_USERS?: string, KARTBOARD_SESSION_SECRET?: string, ACCESS_AUD?: string, ACCESS_TEAM_DOMAIN?: string, ADMIN_EMAILS?: string, __fetchCerts?: Function, __accessNow?: number }} env
   */
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env || {};
    this.events = new SseHub();
    this.rateLimit = new RateLimiter();
    this.users = UserRegistry.fromJson(this.env.KARTBOARD_USERS || '{"users":[]}');
    this.codes = new CredentialBook({
      seeds: this.users,
      store: new DurableAccessCodeStore(ctx.storage)
    });
    this.board = new BoardCoordinator({
      repository: new DurableStateRepository(ctx.storage),
      events: this.events
    });
    const ready = (async () => {
      await this.board.ready;
      const saved = await ctx.storage.get('rateLimit');
      if (saved && typeof saved === 'object') this.rateLimit.load(/** @type {Record<string, number[]>} */ (saved));
    })();
    ctx.blockConcurrencyWhile?.(() => ready);
    this.ready = ready;
  }

  async fetch(request) {
    await this.ready;
    const response = await handleKartBoardRequest(request, {
      basePath: HOSTED_BASE_PATH,
      adminBasePath: ADMIN_BASE_PATH,
      adminMode: 'access',
      adminEnv: this.env,
      adminDeps: {
        fetchCerts: typeof this.env.__fetchCerts === 'function' ? this.env.__fetchCerts : undefined,
        now: typeof this.env.__accessNow === 'number' ? this.env.__accessNow : undefined
      },
      board: this.board,
      events: this.events,
      users: this.users,
      codes: this.codes,
      rateLimit: this.rateLimit,
      sessionSecret: this.env.KARTBOARD_SESSION_SECRET || '',
      now: Date.now,
      asset: () => null,
      clientIp: req => req.headers.get('cf-connecting-ip') || 'unknown',
      logger: console
    });
    await this.#persistRateLimit();
    return response;
  }

  async #persistRateLimit() {
    if (!this.rateLimit.dirty) return;
    this.rateLimit.dirty = false;
    await this.ctx.storage.put('rateLimit', this.rateLimit.dump());
    if (this.rateLimit.dirty) await this.#persistRateLimit();
  }
}
