// Backend tests for server/src/services/RateLimiter.mjs
import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../server/src/services/RateLimiter.mjs';

describe('RateLimiter', () => {
  it('allows up to the limit then blocks with a retry hint', () => {
    const rl = new RateLimiter({ perMinute: 2, windowMs: 60_000 });
    expect(rl.check('dev', 0).allowed).toBe(true);
    expect(rl.check('dev', 1).allowed).toBe(true);
    const third = rl.check('dev', 2);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    const rl = new RateLimiter({ perMinute: 1, windowMs: 60_000 });
    expect(rl.check('a', 0).allowed).toBe(true);
    expect(rl.check('b', 0).allowed).toBe(true);
    expect(rl.check('a', 1).allowed).toBe(false);
  });

  it('slides the window', () => {
    const rl = new RateLimiter({ perMinute: 1, windowMs: 1000 });
    expect(rl.check('a', 0).allowed).toBe(true);
    expect(rl.check('a', 500).allowed).toBe(false);
    expect(rl.check('a', 1001).allowed).toBe(true);
  });

  it('resets', () => {
    const rl = new RateLimiter({ perMinute: 1, windowMs: 1000 });
    rl.check('a', 0);
    rl.reset();
    expect(rl.check('a', 1).allowed).toBe(true);
  });
});
