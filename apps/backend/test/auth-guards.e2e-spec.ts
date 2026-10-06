import { Body, Controller, Get, INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsInt, IsString, Min } from 'class-validator';
import type { IncomingHttpHeaders } from 'http';
import { AuthModule } from '../src/auth/auth.module';
import { SESSION_PROVIDER, type AuthSession, type SessionProvider } from '../src/auth/ports/session-provider';
import { ACTOR_PROFILE_READER, type ActorProfile, type ActorProfileReader } from '../src/auth/ports/actor-profile-reader';
import { SessionGuard } from '../src/auth/session.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { Roles } from '../src/auth/roles.decorator';
import { CurrentActor } from '../src/auth/current-actor.decorator';
import type { Actor } from '../src/common/application/actor';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { createValidationPipe } from '../src/common/validation/create-validation-pipe';

// E2E HTTP de la cadena SessionGuard → RolesGuard → controller, con el filtro y el pipe globales
// de main.ts. La sesión y el perfil vienen de dobles de prueba: no se crean usuarios ni sesiones reales.

const SESSION_HEADER = 'x-test-session';

class FakeSessionProvider implements SessionProvider {
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const userId = headers[SESSION_HEADER];
    if (typeof userId !== 'string' || userId === 'invalida') return null;
    return {
      user: { id: userId, email: `${userId}@e2e.test`, name: userId, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id: `session-${userId}`, expiresAt: new Date(Date.now() + 3_600_000) },
    };
  }
}

const PROFILES: Record<string, ActorProfile> = {
  'user-patient': { userProfileId: 'profile-patient', role: 'patient' },
  'user-doctor': { userProfileId: 'profile-doctor', role: 'doctor' },
  'user-admin': { userProfileId: 'profile-admin', role: 'admin' },
  'user-organization': { userProfileId: 'profile-organization', role: 'organization' },
};

class FakeActorProfileReader implements ActorProfileReader {
  async findByUserId(userId: string) {
    return PROFILES[userId] ?? null;
  }
}

class ProbeDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

@Controller('probe')
@UseGuards(SessionGuard)
class ProbeController {
  @Get('actor')
  actor(@CurrentActor() actor: Actor) {
    return actor;
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('admin')
  adminOnly() {
    return { ok: true };
  }

  @Get('clinical')
  @UseGuards(RolesGuard)
  @Roles('doctor', 'admin')
  doctorOrAdmin() {
    return { ok: true };
  }

  @Get('misconfigured')
  @UseGuards(RolesGuard)
  withoutRoles() {
    return { ok: true };
  }

  @Post('dto')
  dto(@Body() body: ProbeDto) {
    return { received: body, isDto: body instanceof ProbeDto };
  }
}

// Sin @UseGuards: debe seguir siendo pública aunque AuthModule esté cargado (sus guards no son globales).
@Controller('public-probe')
class PublicProbeController {
  @Get()
  ping() {
    return { public: true };
  }
}

describe('Autenticación, autorización y validación por HTTP (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProbeController, PublicProbeController],
    })
      .overrideProvider(SESSION_PROVIDER)
      .useClass(FakeSessionProvider)
      .overrideProvider(ACTOR_PROFILE_READER)
      .useClass(FakeActorProfileReader)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, userId?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return userId ? req.set(SESSION_HEADER, userId) : req;
  };

  describe('401 sin sesión válida', () => {
    it.each(['/probe/actor', '/probe/admin', '/probe/clinical'])('[TC-M00-200][RNF-01] %s sin sesión → 401', async (path) => {
      const res = await get(path);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, message: 'Sesión inválida o no proporcionada', error: 'Unauthorized' });
    });

    it('[TC-M00-201][RNF-01] sesión inválida → 401', async () => {
      expect((await get('/probe/admin', 'invalida')).status).toBe(401);
    });
  });

  describe('403 por rol', () => {
    it.each(['user-patient', 'user-doctor', 'user-organization'])('[TC-M00-210][RF-02] %s en ruta de admin → 403', async (userId) => {
      const res = await get('/probe/admin', userId);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ statusCode: 403, message: 'Tu rol no tiene permiso para esta operación', error: 'Forbidden' });
    });

    it('[TC-M00-211][RF-02][RN-002] usuario autenticado sin perfil de dominio → 403', async () => {
      const res = await get('/probe/admin', 'user-sin-perfil');
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('El usuario aún no tiene un perfil con rol asignado');
    });

    it('[TC-M00-212][RNF-10] ruta con RolesGuard pero sin @Roles → 403 incluso para admin', async () => {
      expect((await get('/probe/misconfigured', 'user-admin')).status).toBe(403);
    });
  });

  describe('acceso permitido con el rol correcto', () => {
    it('[TC-M00-220][RF-02] admin en ruta de admin → 200', async () => {
      const res = await get('/probe/admin', 'user-admin');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it.each(['user-doctor', 'user-admin'])('[TC-M00-221][RF-02] %s en ruta doctor/admin → 200', async (userId) => {
      expect((await get('/probe/clinical', userId)).status).toBe(200);
    });

    it('[TC-M00-222][RN-001][RN-121] el handler recibe el actor con perfil, rol, IP y user-agent', async () => {
      const res = await get('/probe/actor', 'user-doctor').set('User-Agent', 'GestinovoApp/1.0 (Android)');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        userId: 'user-doctor',
        userProfileId: 'profile-doctor',
        role: 'doctor',
        ipAddress: '127.0.0.1',
        userAgent: 'GestinovoApp/1.0 (Android)',
      });
    });

    it('[TC-M00-223][RNF-10] X-Forwarded-For enviado por el cliente no cambia la IP registrada', async () => {
      const res = await get('/probe/actor', 'user-patient').set('X-Forwarded-For', '6.6.6.6');
      expect(res.body.ipAddress).toBe('127.0.0.1');
    });
  });

  describe('rutas públicas', () => {
    it('[TC-M00-224][RF-02] una ruta sin @UseGuards responde 200 sin sesión aunque AuthModule esté cargado', async () => {
      const res = await get('/public-probe');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ public: true });
    });

    it('[TC-M00-225][RF-02] la ruta pública no exige rol: responde igual con una sesión de cualquier rol', async () => {
      expect((await get('/public-probe', 'user-patient')).status).toBe(200);
    });
  });

  describe('validación de entrada global', () => {
    const post = (body: object) => request(app.getHttpServer()).post('/probe/dto').set(SESSION_HEADER, 'user-patient').send(body);

    it('[TC-M00-230][RNF-10] payload válido → 201 y el controller recibe una instancia del DTO', async () => {
      const res = await post({ name: 'Truvada', quantity: 2 });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ received: { name: 'Truvada', quantity: 2 }, isDto: true });
    });

    it('[TC-M00-231][RNF-10] propiedad no declarada → 400', async () => {
      const res = await post({ name: 'Truvada', quantity: 2, role: 'admin' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('property role should not exist');
    });

    it('[TC-M00-232][RNF-10] tipo inválido → 400', async () => {
      const res = await post({ name: 'Truvada', quantity: 'dos' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('quantity must be an integer number');
    });

    it('[TC-M00-233][RNF-01] la validación no se ejecuta antes de la autenticación: sin sesión → 401', async () => {
      const res = await request(app.getHttpServer()).post('/probe/dto').send({ role: 'admin' });
      expect(res.status).toBe(401);
    });
  });
});
