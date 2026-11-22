class RateLimiter {
  constructor({ maxFailures = 8, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.now = now;
    this.buckets = new Map();
    this.dirty = false;
  }

  attempt({ ip, user }) {
    const now = this.now();
    const keys = [`ip:${normalizeIp(ip)}`, `user:${normalizeUser(user)}`];
    const hits = keys.map(key => this.#fresh(key, now));
    if (hits.some(list => list.length >= this.maxFailures)) {
      const blocking = hits.filter(list => list.length >= this.maxFailures);
      const oldest = Math.min(...blocking.map(list => list[0]));
      return { ok: false, retryAfterMs: Math.max(0, this.windowMs - (now - oldest)) };
    }
    for (const [index, key] of keys.entries()) {
      hits[index].push(now);
      this.buckets.set(key, hits[index]);
    }
    this.dirty = true;
    return { ok: true };
  }

  succeed({ ip, user }) {
    this.buckets.delete(`ip:${normalizeIp(ip)}`);
    this.buckets.delete(`user:${normalizeUser(user)}`);
    this.dirty = true;
  }

  dump() {
    const now = this.now();
    /** @type {Record<string, number[]>} */
    const buckets = {};
    for (const [key, stamps] of this.buckets) {
      const fresh = stamps.filter(stamp => now - stamp < this.windowMs);
      if (fresh.length) buckets[key] = fresh;
    }
    return buckets;
  }

  load(buckets) {
    this.buckets = new Map(Object.entries(buckets || {}).map(([key, stamps]) => [key, Array.isArray(stamps) ? stamps.filter(stamp => typeof stamp === 'number') : []]));
  }

  #fresh(key, now) {
    const fresh = (this.buckets.get(key) || []).filter(stamp => now - stamp < this.windowMs);
    this.buckets.set(key, fresh);
    return fresh;
  }
}

function normalizeIp(ip) {
  const text = String(ip || 'unknown');
  return text.startsWith('::ffff:') ? text.slice('::ffff:'.length) : text;
}

function normalizeUser(user) {
  return String(user || 'unknown').trim().toLowerCase();
}

module.exports = { RateLimiter };
