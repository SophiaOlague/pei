import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createIdentityApp, SESSION_HEADER } from './support/identity-e2e';
import { InMemoryDoctorWorld } from './support/doctors-world';
import { FakeAgendaService, FixedClock, InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld } from './support/appointments-in-memory';
import { syntheticCurp } from './support/synthetic-identity';
import { DoctorsModule } from '../src/modules/doctors/doctors.module';
import { AgendaModule } from '../src/modules/agenda/agenda.module';
import { AppointmentsModule } from '../src/modules/appointments/appointments.module';
import { AgendaService } from '../src/modules/agenda/application/use-cases/agenda.use-cases';
import { SPECIALTY_REPOSITORY } from '../src/modules/doctors/application/ports/specialty.repository';
import { DOCTOR_PROFILE_REPOSITORY } from '../src/modules/doctors/application/ports/doctor-profile.repository';
import { DOCTOR_REVIEW_REPOSITORY } from '../src/modules/doctors/application/ports/doctor-review.repository';
import { DOCTOR_IDENTITY_GATEWAY } from '../src/modules/identity/application/ports/doctor-identity.gateway';
import {
  APPOINTMENT_REPOSITORY, BOOKABLE_DOCTORS_READER, BOOKING_ELIGIBILITY, BOOKING_FEATURE, BOOKING_LEGAL_ACCEPTANCES, CANCELLATION_POLICY_REPOSITORY, CONSULTATION_PRICE_REPOSITORY,
} from '../src/modules/appointments/application/ports/appointments.ports';
import { UNIT_OF_WORK } from '../src/common/application/ports/unit-of-work';
import { CLOCK } from '../src/common/application/ports/clock';
import { AUDIT_TRAIL } from '../src/modules/audit/application/ports/audit-trail';
import { EnvBookingFeature, BOOKING_FLAG } from '../src/modules/appointments/infrastructure/adapters';

// E2E HTTP de M08 con dobles en memoria: guards, pipes, DTO y filtro reales; sin BD.
const NOW = new Date('2026-11-10T15:00:00Z');
const S1 = '2026-11-11T16:00:00.000Z';

describe('Citas médicas por HTTP (E2E con dobles, M08)', () => {
  let app: INestApplication;
  let world: InMemoryAppointmentsWorld;
  let store: InMemoryDoctorWorld['store'];

  beforeAll(async () => {
    const doctors = new InMemoryDoctorWorld();
    world = new InMemoryAppointmentsWorld();
    const agenda = new FakeAgendaService(world);
    agenda.days['2026-11-11'] = [S1];
    ({ app, store } = await createIdentityApp({
      store: doctors.store,
      imports: [DoctorsModule, AgendaModule, AppointmentsModule],
      configure: (builder) =>
        builder
          .overrideProvider(UNIT_OF_WORK).useValue(new InMemoryAppointmentsUnitOfWork(world))
          .overrideProvider(AUDIT_TRAIL).useValue(world)
          .overrideProvider(CLOCK).useValue(new FixedClock(NOW))
          .overrideProvider(SPECIALTY_REPOSITORY).useValue(doctors.catalog)
          .overrideProvider(DOCTOR_IDENTITY_GATEWAY).useValue(doctors)
          .overrideProvider(DOCTOR_PROFILE_REPOSITORY).useValue(doctors)
          .overrideProvider(DOCTOR_REVIEW_REPOSITORY).useValue(doctors)
          .overrideProvider(AgendaService).useValue(agenda)
          .overrideProvider(APPOINTMENT_REPOSITORY).useValue(world)
          .overrideProvider(CONSULTATION_PRICE_REPOSITORY).useValue(world)
          .overrideProvider(CANCELLATION_POLICY_REPOSITORY).useValue(world.policies)
          .overrideProvider(BOOKABLE_DOCTORS_READER).useValue(world)
          .overrideProvider(BOOKING_ELIGIBILITY).useValue(world)
          .overrideProvider(BOOKING_FEATURE).useValue(world)
          .overrideProvider(BOOKING_LEGAL_ACCEPTANCES).useValue(world),
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    get: (p: string) => http().get(p).set(SESSION_HEADER, userId),
    post: (p: string) => http().post(p).set(SESSION_HEADER, userId),
    delete: (p: string) => http().delete(p).set(SESSION_HEADER, userId),
  });

  async function admin() {
    const userId = `admin-${randomUUID()}`;
    await store.createAdmin({ userId, firstName: 'Ada', lastName: 'Admin' });
    return userId;
  }
  async function patient() {
    const userId = `paciente-${randomUUID()}`;
    const userProfileId = await store.createPatient({ userId, firstName: 'Pau', lastName: 'Paciente', curp: syntheticCurp(), birthDate: '1990-01-01', phone: null, emergencyContactName: null, emergencyContactPhone: null } as never);
    world.addPatient({ id: randomUUID(), userProfileId });
    return userId;
  }
  function doctor() {
    const userId = `medico-${randomUUID()}`;
    const userProfileId = store.createDoctorForTest({ userId, firstName: 'Ana', lastName: 'Médica', curp: syntheticCurp() });
    const id = randomUUID();
    world.addDoctor({ id, userProfileId });
    return { userId, id };
  }

  it('[TC-M08-100][RF-02] sin sesión 401; con otro rol 403 en cada grupo de rutas', async () => {
    expect((await http().get('/admin/consultation-price')).status).toBe(401);
    const p = await patient();
    const d = doctor();
    expect((await as(p).get('/admin/consultation-price')).status).toBe(403);
    expect((await as(d.userId).get('/admin/appointment-policy')).status).toBe(403);
    expect((await as(d.userId).get('/doctors/bookable')).status).toBe(403);
    expect((await as(p).get('/me/doctor/appointments?from=2026-11-11T00:00:00Z&to=2026-11-12T00:00:00Z')).status).toBe(403);
  });

  it('[TC-M08-101][AP-2] el administrador publica el precio y la política, y consulta el historial', async () => {
    const a = await admin();
    expect((await as(a).get('/admin/consultation-price')).status).toBe(404);
    const price = await as(a).post('/admin/consultation-price/versions').send({ price: '200.00' });
    expect(price.status).toBe(201);
    expect(price.body).toMatchObject({ price: '200.00', currency: 'MXN', effectiveUntil: null });
    expect((await as(a).post('/admin/consultation-price/versions').send({ price: '200' })).status).toBe(422);
    expect((await as(a).post('/admin/consultation-price/versions').send({ price: '-5' })).status).toBe(400);
    expect((await as(a).post('/admin/consultation-price/versions').send({ price: '250.00', doctorId: randomUUID() })).status).toBe(400);
    const policy = await as(a).post('/admin/appointment-policy/versions').send({ refundDeadlineHours: 24, maxReschedules: 2, doctorWaitMinutes: 30, patientToleranceMinutes: 15 });
    expect(policy.status).toBe(201);
    expect((await as(a).post('/admin/appointment-policy/versions').send({ refundDeadlineHours: 24, maxReschedules: 2, doctorWaitMinutes: 10, patientToleranceMinutes: 15 })).status).toBe(400);
    expect((await as(a).get('/admin/consultation-price/versions')).body.versions).toHaveLength(1);
  });

  it('[TC-M08-102][AP-16] con la bandera desactivada, POST /me/patient/appointments responde 422', async () => {
    world.bookingEnabled = false;
    const p = await patient();
    const d = doctor();
    const res = await as(p).post('/me/patient/appointments').send({ doctorProfileId: d.id, startsAt: S1, reason: 'Consulta' });
    expect(res.status).toBe(422);
    world.bookingEnabled = true;
  });

  it('[TC-M08-103][RF-12] reserva, lista, detalle y liberación; la cita de otro paciente es 404', async () => {
    const p = await patient();
    const d = doctor();
    const created = await as(p).post('/me/patient/appointments').send({ doctorProfileId: d.id, startsAt: S1, reason: 'Consulta' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'pending_payment', price: '200.00', holdExpiresAt: '2026-11-10T15:05:00.000Z' });
    expect((await as(p).get('/me/patient/appointments')).body.appointments).toHaveLength(1);
    expect((await as(await patient()).get(`/me/patient/appointments/${created.body.id}`)).status).toBe(404);
    expect((await as(await patient()).post('/me/patient/appointments').send({ doctorProfileId: d.id, startsAt: S1, reason: 'Otra' })).status).toBe(409);
    expect((await as(p).post(`/me/patient/appointments/${created.body.id}/cancel`).send({})).status).toBe(409);
    expect((await as(p).delete(`/me/patient/appointments/${created.body.id}/hold`)).status).toBe(204);
    expect((await as(p).get(`/me/patient/appointments/${created.body.id}`)).body.status).toBe('expired');
  });

  it('[TC-M08-365][AP-26] sin las dos aceptaciones legales vigentes, la reserva responde 403 y no crea la cita', async () => {
    const p = await patient();
    const d = doctor();
    world.legalByPatient.set(world.state.patients.at(-1)!.userProfileId, null);
    const before = world.state.appointments.length;
    const res = await as(p).post('/me/patient/appointments').send({ doctorProfileId: d.id, startsAt: S1, reason: 'Consulta' });
    expect(res.status).toBe(403);
    expect(world.state.appointments).toHaveLength(before);
  });

  it('[TC-M08-381][DA-6][AP-26] POST /me/patient/appointments/:id/reschedule: 200 con la cita nueva; 404 ajena; 409 repetida; 400 DTO; 403 otro rol', async () => {
    const p = await patient();
    const d = doctor();
    const patientProfileId = world.state.patients.at(-1)!.id;
    const policyId = world.state.policies.find((v) => v.effectiveUntil === null)?.id ?? randomUUID();
    if (!world.state.policies.some((v) => v.id === policyId)) {
      world.state.policies.push({ id: policyId, refundDeadlineHours: 24, maxReschedules: 2, doctorWaitMinutes: 30, patientToleranceMinutes: 15, effectiveFrom: new Date(0), effectiveUntil: null, createdBy: 'seed' });
    }
    const originalId = randomUUID();
    world.seedAppointment({
      id: originalId, patientId: patientProfileId, doctorId: d.id, scheduledAt: new Date('2026-11-11T17:00:00.000Z'), cancellationPolicyId: policyId,
      price: '180.00', reason: 'Control', privacyLegalAcceptanceId: 'acc-p', termsLegalAcceptanceId: 'acc-t',
    });
    const path = `/me/patient/appointments/${originalId}/reschedule`;
    expect((await as(p).post(path).send({ startsAt: S1, extra: 1 })).status).toBe(400);
    expect((await as(p).post(path).send({ startsAt: 'mañana' })).status).toBe(400);
    expect((await as(d.userId).post(path).send({ startsAt: S1 })).status).toBe(403);
    expect((await as(await patient()).post(path).send({ startsAt: S1 })).status).toBe(404);
    const res = await as(p).post(path).send({ startsAt: S1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'confirmed', scheduledAt: S1, price: '180.00', reason: 'Control', rescheduledFromAppointmentId: originalId });
    expect(world.state.appointments.find((a) => a.id === res.body.id)).toMatchObject({ privacyLegalAcceptanceId: 'acc-p', termsLegalAcceptanceId: 'acc-t' });
    expect(world.state.appointments.find((a) => a.id === originalId)!.status).toBe('rescheduled');
    expect((await as(p).post(path).send({ startsAt: S1 })).status).toBe(409);
  });

  it('[TC-M08-104] validación de DTO: propiedades desconocidas, fechas y UUID', async () => {
    const p = await patient();
    expect((await as(p).post('/me/patient/appointments').send({ doctorProfileId: 'x', startsAt: S1, reason: 'a' })).status).toBe(400);
    expect((await as(p).post('/me/patient/appointments').send({ doctorProfileId: randomUUID(), startsAt: 'mañana', reason: 'a' })).status).toBe(400);
    expect((await as(p).post('/me/patient/appointments').send({ doctorProfileId: randomUUID(), startsAt: S1, reason: 'a', status: 'confirmed' })).status).toBe(400);
  });

  it('[TC-M08-105][AP-16] no existe ninguna ruta que confirme citas', async () => {
    const p = await patient();
    for (const path of ['/me/patient/appointments/x/confirm', '/appointments/confirm', '/payments/confirm']) {
      expect((await as(p).post(path).send({})).status).toBe(404);
    }
  });

  it('[TC-M08-106][AP-16] EnvBookingFeature: solo "true" activa la reserva', () => {
    const before = process.env[BOOKING_FLAG];
    const feature = new EnvBookingFeature();
    delete process.env[BOOKING_FLAG];
    expect(feature.enabled()).toBe(false);
    process.env[BOOKING_FLAG] = 'TRUE';
    expect(feature.enabled()).toBe(false);
    process.env[BOOKING_FLAG] = 'true';
    expect(feature.enabled()).toBe(true);
    if (before === undefined) delete process.env[BOOKING_FLAG];
    else process.env[BOOKING_FLAG] = before;
  });
});
