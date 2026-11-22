import { BoardCoordinator } from '../src/application/coordinator.js';
import { handleKartBoardRequest } from '../src/http/handle-request.js';
import { HOSTED_BASE_PATH } from '../src/http/constants.js';
import { DurableStateRepository } from '../src/infrastructure/durable-state-repository.js';
import { SseHub } from '../src/infrastructure/sse-hub.js';
import { RateLimiter } from '../src/auth/rate-limit.js';
import { UserRegistry } from '../src/auth/users.js';

export class KartBoardRoom {
  /**
   * @param {{ storage: { get: (key: string) => Promise<unknown>, put: (key: string, value: unknown) => Promise<void> }, blockConcurrencyWhile?: (fn: () => Promise<void>) => Promise<void> }} ctx
   * @param {{ KARTBOARD_USERS?: string, KARTBOARD_SESSION_SECRET?: string }} env
   */
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env || {};
    this.events = new SseHub();
    this.rateLimit = new RateLimiter();
    this.users = UserRegistry.fromJson(this.env.KARTBOARD_USERS || '{"users":[]}');
    this.board = new BoardCoordinator({
      repository: new DurableStateRepository(ctx.storage),
      events: this.events
    });
    const ready = (async () => {
      await this.board.ready;
      const saved = await ctx.storage.get('rateLimit');
      if (saved && typeof saved === 'object') this.rateLimit.load(saved);
    })();
    ctx.blockConcurrencyWhile?.(() => ready);
    this.ready = ready;
  }

  async fetch(request) {
    await this.ready;
    const response = await handleKartBoardRequest(request, {
      basePath: HOSTED_BASE_PATH,
      board: this.board,
      events: this.events,
      users: this.users,
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
