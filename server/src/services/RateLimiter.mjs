// ---------------------------------------------------------------------------
// server/src/services/RateLimiter.mjs
//
// Dependency-free sliding-window rate limiter. Used to stop a device (or a
// misbehaving client) from triggering an unbounded number of SMS alerts.
//
// The clock is injectable so tests are deterministic.
// ---------------------------------------------------------------------------

export class RateLimiter {
  /**
   * @param {object} opts
   * @param {number} opts.perMinute Maximum requests allowed per window.
   * @param {number} opts.windowMs  Window length in milliseconds (default 60s).
   */
  constructor({ perMinute = 10, windowMs = 60_000 } = {}) {
    this.perMinute = Math.max(1, perMinute);
    this.windowMs = Math.max(1000, windowMs);
    this.hits = new Map();
  }

  /**
   * Record (and check) a request for `key`.
   * @returns {{allowed: boolean, remaining: number, retryAfterMs: number}}
   */
  check(key, now = Date.now()) {
    const k = String(key || 'anonymous');
    const recent = (this.hits.get(k) || []).filter((t) => now - t < this.windowMs);

    if (recent.length >= this.perMinute) {
      this.hits.set(k, recent);
      const retryAfterMs = Math.max(0, this.windowMs - (now - recent[0]));
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    recent.push(now);
    this.hits.set(k, recent);
    return { allowed: true, remaining: Math.max(0, this.perMinute - recent.length), retryAfterMs: 0 };
  }

  /** Drop all recorded hits (used by tests / hot reload). */
  reset() {
    this.hits.clear();
  }
}
