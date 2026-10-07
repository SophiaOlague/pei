import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { AUTH_INSTANCE, AUTH_RATE_LIMIT } from '../src/auth/auth.config';
import { AuthController } from '../src/modules/identity/presentation/auth.controller';
import { createMemoryAuth, TEST_AUTH_BASE_URL } from './support/better-auth-memory';

// DT-8: rate limit de Better Auth SIEMPRE activo, con los límites de AUTH_RATE_LIMIT, probado por HTTP.
// Archivo separado: el almacenamiento en memoria de Better Auth es global por proceso de Jest.

describe('Rate limit de autenticación por HTTP (DT-8)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { auth } = createMemoryAuth();
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule], controllers: [AuthController] })
      .overrideProvider(AUTH_INSTANCE)
      .useValue(auth)
      .compile();
    app = moduleRef.createNestApplication({ logger: false, bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/auth${path}`).set('Origin', TEST_AUTH_BASE_URL).send(body);

  it.each([
    ['/sign-in/email', { email: 'nadie@example.test', password: 'Contrasena-Incorrecta-1' }],
    ['/sign-up/email', { email: 'x@example.test', password: 'Contrasena-Sintetica-1', name: 'X' }],
    ['/request-password-reset', { email: 'nadie@example.test', redirectTo: '/reset' }],
    ['/send-verification-email', { email: 'nadie@example.test' }],
    ['/reset-password', { token: 'token-falso', newPassword: 'Contrasena-Nueva-1' }],
  ])('[TC-M02-207][DT-8] %s: tras el límite configurado → 429', async (path, body) => {
    const { max } = AUTH_RATE_LIMIT.customRules[path];
    for (let i = 0; i < max; i++) {
      expect((await post(path, body)).status).not.toBe(429);
    }
    const blocked = await post(path, body);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['x-retry-after'])).toBeGreaterThan(0);
  });

  it('[TC-M02-208][DT-8][RNF-10] X-Forwarded-For o el encabezado interno enviados por el cliente no evaden el límite', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', TEST_AUTH_BASE_URL)
      .set('X-Forwarded-For', '198.51.100.23')
      .set('X-PEI-Client-IP', '198.51.100.24')
      .send({ email: 'nadie@example.test', password: 'Contrasena-Incorrecta-1' });
    expect(res.status).toBe(429);
  });
});
