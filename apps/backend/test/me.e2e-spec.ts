import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { createValidationPipe } from '../src/common/validation/create-validation-pipe';

// E2E con la aplicación real (AppModule + Better Auth): solo casos sin sesión,
// para no crear usuarios ni sesiones en la BD de desarrollo.
describe('Rutas protegidas reales sin sesión (E2E, AppModule)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['get', '/me'],
    ['post', '/me/complete-profile'],
    ['post', '/me/upload'],
  ] as const)('[TC-M00-240][RNF-01] %s %s sin cookie de sesión → 401', async (method, path) => {
    const res = await request(app.getHttpServer())[method](path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ statusCode: 401, message: 'Sesión inválida o no proporcionada', error: 'Unauthorized' });
  });

  it('[TC-M00-242][RF-02] la ruta pública GET / sigue accesible sin sesión', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe('Hello World!');
  });

  it('[TC-M00-243][RF-02] las rutas de Better Auth (/api/auth/*) no quedan bloqueadas por los guards', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/get-session');
    expect(res.status).toBe(200);
  });

  it('[TC-M00-241][RNF-01] GET /me con una cookie de sesión falsificada → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', 'better-auth.session_token=token-falso.firma-falsa');
    expect(res.status).toBe(401);
  });
});
