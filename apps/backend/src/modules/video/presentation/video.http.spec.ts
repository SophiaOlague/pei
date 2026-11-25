import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { IncomingHttpHeaders } from 'http';
import { AuthModule } from '../../../auth/auth.module';
import { SESSION_PROVIDER, type AuthSession, type SessionProvider } from '../../../auth/ports/session-provider';
import { ACTOR_PROFILE_READER, type ActorProfile, type ActorProfileReader } from '../../../auth/ports/actor-profile-reader';
import { DomainExceptionFilter } from '../../../common/filters/domain-exception.filter';
import { createValidationPipe } from '../../../common/validation/create-validation-pipe';
import { AppointmentNotFoundError } from '../../appointments/domain/appointments.errors';
import { SessionNotOpenError } from '../domain/video.errors';
import { DoctorSessionUseCases } from '../application/use-cases/doctor-session.use-cases';
import { PatientSessionUseCases } from '../application/use-cases/patient-session.use-cases';
import { DoctorSessionController, DoctorSessionsListController, PatientSessionController } from './video.controllers';

// Rutas de videoconsulta por HTTP (sin BD ni proveedor): la cadena real SessionGuard → RolesGuard, el filtro y el pipe
// globales; los casos de uso son dobles.
const SESSION_HEADER = 'x-test-session';
const APPOINTMENT = '66666666-6666-4666-8666-666666666666';

class FakeSessionProvider implements SessionProvider {
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const userId = headers[SESSION_HEADER];
    if (typeof userId !== 'string') return null;
    return {
      user: { id: userId, email: `${userId}@video.test`, name: userId, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id: `session-${userId}`, expiresAt: new Date(Date.now() + 3_600_000) },
    };
  }
}
const PROFILES: Record<string, ActorProfile> = {
  'user-patient': { userProfileId: '44444444-4444-4444-8444-444444444444', role: 'patient' },
  'user-doctor': { userProfileId: '55555555-5555-4555-8555-555555555555', role: 'doctor' },
  'user-admin': { userProfileId: '11111111-1111-4111-8111-111111111111', role: 'admin' },
};
class FakeActorProfileReader implements ActorProfileReader {
  async findByUserId(userId: string) {
    return PROFILES[userId] ?? null;
  }
}

describe('Videoconsulta por HTTP (guards, roles y errores)', () => {
  let app: INestApplication;
  const patient = { state: jest.fn(), enter: jest.fn(), presence: jest.fn(), leave: jest.fn(), token: jest.fn() };
  const doctor = { state: jest.fn(), enter: jest.fn(), presence: jest.fn(), leave: jest.fn(), admit: jest.fn(), end: jest.fn(), token: jest.fn(), sessionsOf: jest.fn() };
  const as = (user: string) => ({ [SESSION_HEADER]: user });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [PatientSessionController, DoctorSessionController, DoctorSessionsListController],
      providers: [
        { provide: PatientSessionUseCases, useValue: patient },
        { provide: DoctorSessionUseCases, useValue: doctor },
      ],
    })
      .overrideProvider(SESSION_PROVIDER).useClass(FakeSessionProvider)
      .overrideProvider(ACTOR_PROFILE_READER).useClass(FakeActorProfileReader)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    for (const f of [...Object.values(patient), ...Object.values(doctor)]) f.mockReset().mockResolvedValue({ ok: true });
  });

  it('[TC-VID-160] sin sesión responde 401 y no llama a ningún caso de uso', async () => {
    await request(app.getHttpServer()).post(`/me/patient/appointments/${APPOINTMENT}/session/enter`).expect(401);
    await request(app.getHttpServer()).post(`/me/doctor/appointments/${APPOINTMENT}/session/admit`).expect(401);
    expect(patient.enter).not.toHaveBeenCalled();
    expect(doctor.admit).not.toHaveBeenCalled();
  });

  it('[TC-VID-161] cada rol solo usa sus rutas (403 para los demás)', async () => {
    await request(app.getHttpServer()).post(`/me/patient/appointments/${APPOINTMENT}/session/enter`).set(as('user-doctor')).expect(403);
    await request(app.getHttpServer()).post(`/me/doctor/appointments/${APPOINTMENT}/session/end`).set(as('user-patient')).expect(403);
    await request(app.getHttpServer()).get('/me/doctor/sessions').set(as('user-admin')).expect(403);
    expect(patient.enter).not.toHaveBeenCalled();
    expect(doctor.end).not.toHaveBeenCalled();
  });

  it('[TC-VID-162] un id que no es UUID responde 400', async () => {
    await request(app.getHttpServer()).get('/me/patient/appointments/no-es-uuid/session').set(as('user-patient')).expect(400);
  });

  it('[TC-VID-163] las rutas llaman a su caso de uso con el actor de la sesión; los POST responden 200', async () => {
    const server = app.getHttpServer();
    for (const op of ['enter', 'presence', 'leave', 'token'] as const) {
      await request(server).post(`/me/patient/appointments/${APPOINTMENT}/session/${op}`).set(as('user-patient')).expect(200);
      expect(patient[op]).toHaveBeenCalledWith(expect.objectContaining({ role: 'patient' }), APPOINTMENT);
    }
    for (const op of ['enter', 'presence', 'leave', 'admit', 'end', 'token'] as const) {
      await request(server).post(`/me/doctor/appointments/${APPOINTMENT}/session/${op}`).set(as('user-doctor')).expect(200);
      expect(doctor[op]).toHaveBeenCalledWith(expect.objectContaining({ role: 'doctor' }), APPOINTMENT);
    }
    await request(server).get(`/me/patient/appointments/${APPOINTMENT}/session`).set(as('user-patient')).expect(200);
    await request(server).get('/me/doctor/sessions').set(as('user-doctor')).expect(200);
  });

  it('[TC-VID-164] los errores de dominio se traducen: cita ajena 404, sala sin abrir 409 con la hora de apertura', async () => {
    patient.enter.mockRejectedValueOnce(new AppointmentNotFoundError());
    await request(app.getHttpServer()).post(`/me/patient/appointments/${APPOINTMENT}/session/enter`).set(as('user-patient')).expect(404);
    patient.enter.mockRejectedValueOnce(new SessionNotOpenError(new Date('2026-11-20T15:45:00.000Z')));
    const res = await request(app.getHttpServer()).post(`/me/patient/appointments/${APPOINTMENT}/session/enter`).set(as('user-patient')).expect(409);
    expect(res.body).toMatchObject({ error: 'SessionNotOpenError', details: { opensAt: '2026-11-20T15:45:00.000Z' } });
  });
});
