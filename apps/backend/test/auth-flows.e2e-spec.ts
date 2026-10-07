import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { AUTH_INSTANCE } from '../src/auth/auth.config';
import { AuthController } from '../src/modules/identity/presentation/auth.controller';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { createMemoryAuth, TEST_AUTH_BASE_URL, tokenFromUrl } from './support/better-auth-memory';

// E2E HTTP de los flujos de autenticación de M02 (DP-2) con Better Auth real (createAuth de PEI),
// adaptador en memoria y EmailSender falso: sin Neon y sin correos reales (DT-19).

describe('Autenticación de PEI por HTTP (Better Auth en memoria)', () => {
  let app: INestApplication;
  let memory: ReturnType<typeof createMemoryAuth>;

  beforeAll(async () => {
    memory = createMemoryAuth({ relaxedRateLimit: true });
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule], controllers: [AuthController] })
      .overrideProvider(AUTH_INSTANCE)
      .useValue(memory.auth)
      .compile();
    app = moduleRef.createNestApplication({ logger: false, bodyParser: false });
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body: object, agent: any = request(app.getHttpServer())) =>
    agent.post(`/api/auth${path}`).set('Origin', TEST_AUTH_BASE_URL).send(body);
  const flush = () => new Promise((resolve) => setImmediate(resolve)); // los correos salen sin esperar respuesta

  async function signUp(email: string, password = 'Contrasena-Sintetica-1') {
    const res = await post('/sign-up/email', { email, password, name: 'Paciente Sintético' });
    await flush();
    return res;
  }

  async function verify(email: string, agent = request.agent(app.getHttpServer())) {
    const link = memory.emailSender.last('email_verification', email)!;
    const res = await agent.get(`/api/auth/verify-email?token=${tokenFromUrl(link.url)}`).set('Origin', TEST_AUTH_BASE_URL);
    return { res, agent };
  }

  it('[TC-M02-200][DP-2][RF-01] registro sin sesión, correo de verificación enviado e inicio de sesión sin verificar → 403 EMAIL_NOT_VERIFIED', async () => {
    const email = 'flujo1@example.test';
    const res = await signUp(email);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeNull();
    expect(memory.emailSender.last('email_verification', email)?.url).toContain('/api/auth/verify-email?token=');

    const signIn = await post('/sign-in/email', { email, password: 'Contrasena-Sintetica-1' });
    expect(signIn.status).toBe(403);
    expect(signIn.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('[TC-M02-201][DP-2][RNF-10] un correo ya registrado recibe la misma respuesta genérica (sin enumeración)', async () => {
    const email = 'flujo2@example.test';
    const first = await signUp(email);
    const duplicate = await signUp(email, 'Otra-Contrasena-123');
    expect(duplicate.status).toBe(first.status);
    expect(duplicate.body.token).toBeNull();
    expect(Object.keys(duplicate.body).sort()).toEqual(Object.keys(first.body).sort());
  });

  it('[TC-M02-202][DP-2] la verificación del correo abre sesión (autoSignInAfterVerification)', async () => {
    const email = 'flujo3@example.test';
    await signUp(email);
    const { res, agent } = await verify(email);
    expect([200, 302]).toContain(res.status);

    const session = await agent.get('/api/auth/get-session');
    expect(session.status).toBe(200);
    expect(session.body.user).toMatchObject({ email, emailVerified: true });
  });

  it('[TC-M02-203][DP-2] recuperación: respuesta genérica, nueva contraseña, sesiones revocadas y la anterior deja de servir', async () => {
    const email = 'flujo4@example.test';
    const oldPassword = 'Contrasena-Anterior-1';
    await signUp(email, oldPassword);
    const { agent } = await verify(email);
    expect((await agent.get('/api/auth/get-session')).body.user.email).toBe(email);

    const unknown = await post('/request-password-reset', { email: 'nadie@example.test', redirectTo: '/reset' });
    const known = await post('/request-password-reset', { email, redirectTo: '/reset' });
    await flush();
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(memory.emailSender.outbox.some((m) => m.to === 'nadie@example.test')).toBe(false);

    const token = tokenFromUrl(memory.emailSender.last('password_reset', email)!.url);
    const reset = await post('/reset-password', { token, newPassword: 'Contrasena-Nueva-2026' });
    expect(reset.status).toBe(200);

    const sessionAfter = await agent.get('/api/auth/get-session');
    expect(sessionAfter.body).toBeNull();
    expect((await post('/sign-in/email', { email, password: oldPassword })).status).toBe(401);
    expect((await post('/sign-in/email', { email, password: 'Contrasena-Nueva-2026' })).status).toBe(200);
  });

  it('[TC-M02-204][DP-2] un token de recuperación reutilizado o caducado → 400 INVALID_TOKEN', async () => {
    const email = 'flujo5@example.test';
    await signUp(email);
    await verify(email);

    await post('/request-password-reset', { email, redirectTo: '/reset' });
    await flush();
    const token = tokenFromUrl(memory.emailSender.last('password_reset', email)!.url);
    expect((await post('/reset-password', { token, newPassword: 'Contrasena-Nueva-1' })).status).toBe(200);
    const reused = await post('/reset-password', { token, newPassword: 'Contrasena-Nueva-2' });
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('INVALID_TOKEN');

    // Reloj controlado: el token vence (expiresAt en el pasado) antes de usarse.
    await post('/request-password-reset', { email, redirectTo: '/reset' });
    await flush();
    const expiring = tokenFromUrl(memory.emailSender.last('password_reset', email)!.url);
    const row = memory.data.verification.find((v) => String(v.identifier).includes(expiring));
    expect(row).toBeDefined();
    row!.expiresAt = new Date(Date.now() - 1000);
    const expired = await post('/reset-password', { token: expiring, newPassword: 'Contrasena-Nueva-3' });
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe('INVALID_TOKEN');
  });

  it('[TC-M02-205][DT-11] contraseña de menos de 8 o más de 128 caracteres → 400', async () => {
    expect((await post('/sign-up/email', { email: 'corta@example.test', password: '1234567', name: 'X' })).status).toBe(400);
    expect((await post('/sign-up/email', { email: 'larga@example.test', password: 'x'.repeat(129), name: 'X' })).status).toBe(400);
    expect((await post('/sign-up/email', { email: 'justa@example.test', password: 'x'.repeat(128), name: 'X' })).status).toBe(200);
  });

  it('[TC-M02-206][DP-12] /update-user, /change-email y /delete-user están desactivadas → 404 (también con sesión)', async () => {
    const email = 'flujo6@example.test';
    await signUp(email);
    const { agent } = await verify(email);
    for (const path of ['/update-user', '/change-email', '/delete-user']) {
      expect((await post(path, { name: 'Otro nombre', newEmail: 'otro@example.test' }, agent)).status).toBe(404);
    }
    for (const path of ['/update-user', '/change-email']) {
      expect((await post(path, {})).status).toBe(404);
    }
    expect((await agent.get('/api/auth/get-session')).body.user).toMatchObject({ email, name: 'Paciente Sintético' });
  });
});
