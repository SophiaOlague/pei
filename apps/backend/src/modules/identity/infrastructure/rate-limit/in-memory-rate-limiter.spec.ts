import { InMemoryRateLimiter } from './in-memory-rate-limiter';

class FakeClock {
  constructor(public time = Date.UTC(2026, 9, 6, 12)) {}
  now() {
    return new Date(this.time);
  }
}

describe('RateLimiter en memoria (DT-8)', () => {
  const rule = { max: 3, windowSeconds: 3600 };

  it('[TC-M02-070][DT-8] permite hasta el máximo y después rechaza con Retry-After', async () => {
    const limiter = new InMemoryRateLimiter(new FakeClock());
    for (let i = 0; i < 3; i++) expect((await limiter.consume('u1', rule)).allowed).toBe(true);
    expect(await limiter.consume('u1', rule)).toEqual({ allowed: false, retryAfterSeconds: 3600 });
  });

  it('[TC-M02-071][DT-8] la ventana se reinicia al vencer', async () => {
    const clock = new FakeClock();
    const limiter = new InMemoryRateLimiter(clock);
    for (let i = 0; i < 3; i++) await limiter.consume('u1', rule);
    clock.time += 3599_000;
    expect(await limiter.consume('u1', rule)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    clock.time += 1_000;
    expect((await limiter.consume('u1', rule)).allowed).toBe(true);
  });

  it('[TC-M02-072][DT-8] cada clave (usuario y operación) tiene su propio contador', async () => {
    const limiter = new InMemoryRateLimiter(new FakeClock());
    for (let i = 0; i < 3; i++) await limiter.consume('identity_verification_upload:u1', rule);
    expect((await limiter.consume('identity_verification_upload:u1', rule)).allowed).toBe(false);
    expect((await limiter.consume('identity_verification_upload:u2', rule)).allowed).toBe(true);
    expect((await limiter.consume('profile_photo_upload:u1', rule)).allowed).toBe(true);
  });
});
