import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createIdentityApp, SESSION_HEADER } from './support/identity-e2e';
import { InMemoryDoctorAuditTrail, InMemoryDoctorUnitOfWork, InMemoryDoctorWorld } from './support/doctors-world';
import { FixedClock, InMemoryAgendaRepository, InMemoryAgendaUnitOfWork } from './support/agenda-in-memory';
import { syntheticCurp } from './support/synthetic-identity';
import { DoctorsModule } from '../src/modules/doctors/doctors.module';
import { AgendaModule } from '../src/modules/agenda/agenda.module';
import { SPECIALTY_REPOSITORY } from '../src/modules/doctors/application/ports/specialty.repository';
import { DOCTOR_PROFILE_REPOSITORY } from '../src/modules/doctors/application/ports/doctor-profile.repository';
import { DOCTOR_REVIEW_REPOSITORY } from '../src/modules/doctors/application/ports/doctor-review.repository';
import { DOCTOR_IDENTITY_GATEWAY } from '../src/modules/identity/application/ports/doctor-identity.gateway';
import { AGENDA_REPOSITORY } from '../src/modules/agenda/application/ports/agenda.repository';
import { UNIT_OF_WORK } from '../src/common/application/ports/unit-of-work';
import { CLOCK } from '../src/common/application/ports/clock';
import { AUDIT_TRAIL } from '../src/modules/audit/application/ports/audit-trail';

// E2E HTTP de la agenda (M07) con dobles en memoria: guards, pipes y filtro reales; sin BD.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.7 sintetico');
const BASE = '/me/doctor/agenda';

describe('Agenda médica por HTTP (E2E con dobles, M07)', () => {
  let app: INestApplication;
  let world: InMemoryDoctorWorld;
  let agenda: InMemoryAgendaRepository;

  beforeAll(async () => {
    world = new InMemoryDoctorWorld();
    agenda = new InMemoryAgendaRepository(world);
    ({ app } = await createIdentityApp({
      store: world.store,
      imports: [DoctorsModule, AgendaModule],
      configure: (builder) =>
        builder
          .overrideProvider(UNIT_OF_WORK).useValue(new InMemoryAgendaUnitOfWork(new InMemoryDoctorUnitOfWork(world), agenda))
          .overrideProvider(AUDIT_TRAIL).useValue(new InMemoryDoctorAuditTrail(world))
          .overrideProvider(CLOCK).useValue(new FixedClock(new Date('2026-11-08T12:00:00Z')))
          .overrideProvider(SPECIALTY_REPOSITORY).useValue(world.catalog)
          .overrideProvider(DOCTOR_IDENTITY_GATEWAY).useValue(world)
          .overrideProvider(DOCTOR_PROFILE_REPOSITORY).useValue(world)
          .overrideProvider(DOCTOR_REVIEW_REPOSITORY).useValue(world)
          .overrideProvider(AGENDA_REPOSITORY).useValue(agenda),
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    get: (path: string) => http().get(path).set(SESSION_HEADER, userId),
    post: (path: string) => http().post(path).set(SESSION_HEADER, userId),
    put: (path: string) => http().put(path).set(SESSION_HEADER, userId),
    delete: (path: string) => http().delete(path).set(SESSION_HEADER, userId),
  });

  async function doctor(approve = true) {
    const userId = `medico-${randomUUID()}`;
    const res = await as(userId).post('/me/doctor-profile').send({ firstName: 'Ana', lastName: 'Pérez', curp: syntheticCurp(), specialtyId: world.catalog.byCode('medicina_general').id });
    expect(res.status).toBe(201);
    world.acceptDoctorRegime(res.body.userProfileId);
    await as(userId).post('/me/doctor/identity-verifications').attach('front', JPEG, 'f.jpg').attach('back', JPEG, 'b.jpg');
    await as(userId).post('/me/doctor/license-verifications').field('licenseNumber', `A${randomUUID().slice(0, 6)}`).attach('document', PDF, 'c.pdf');
    if (approve) {
      world.review('identity', res.body.doctorProfileId, 'approved');
      world.review('license', res.body.doctorProfileId, 'approved');
    }
    return userId;
  }

  it('[TC-M07-040][RF-10] sin sesión 401; GET devuelve la agenda inicial con la zona horaria', async () => {
    expect((await http().get(BASE)).status).toBe(401);
    const d = await doctor();
    const res = await as(d).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timeZone: 'America/Mexico_City', canOperate: true, durationMinutes: 30, availability: [], timeOff: [] });
  });

  it('[TC-M07-041] un usuario sin perfil de médico recibe 403', async () => {
    expect((await as(`otro-${randomUUID()}`).get(BASE)).status).toBe(403);
  });

  it('[TC-M07-042][RF-10][D-4] PUT availability reemplaza; solapamiento, 7 franjas o propiedades extra → 400', async () => {
    const d = await doctor();
    const windows = [{ weekday: 1, start: '09:00', end: '13:00' }, { weekday: 1, start: '22:00', end: '24:00' }, { weekday: 2, start: '00:00', end: '01:00' }];
    const ok = await as(d).put(`${BASE}/availability`).send({ windows });
    expect(ok.status).toBe(200);
    expect(ok.body.availability).toEqual(windows);
    expect((await as(d).put(`${BASE}/availability`).send({ windows: [{ weekday: 1, start: '09:00', end: '10:00' }, { weekday: 1, start: '09:30', end: '11:00' }] })).status).toBe(400);
    const seven = Array.from({ length: 7 }, (_, i) => ({ weekday: 4, start: `1${i}:00`, end: `1${i}:30` }));
    expect((await as(d).put(`${BASE}/availability`).send({ windows: seven })).status).toBe(400);
    expect((await as(d).put(`${BASE}/availability`).send({ windows, doctorId: randomUUID() })).status).toBe(400);
    expect((await as(d).put(`${BASE}/availability`).send({ windows: [{ weekday: 1, start: '9:00', end: '10:00' }] })).status).toBe(400);
    expect((await as(d).get(BASE)).body.availability).toEqual(windows);
  });

  it('[TC-M07-043][D-3] PUT duration: 15–120 en múltiplos de 5', async () => {
    const d = await doctor();
    expect((await as(d).put(`${BASE}/duration`).send({ minutes: 45 })).body).toEqual({ durationMinutes: 45 });
    for (const minutes of [10, 47, 125, '30']) expect((await as(d).put(`${BASE}/duration`).send({ minutes })).status).toBe(400);
    expect((await as(d).get(BASE)).body.durationMinutes).toBe(45);
  });

  it('[TC-M07-044][RF-11][D-6] time-off: crear 201, inválido 400, eliminar 204, ajeno 404, terminado 422', async () => {
    const d = await doctor();
    const other = await doctor();
    const created = await as(d).post(`${BASE}/time-off`).send({ startsAt: '2026-11-20T06:00:00Z', endsAt: '2026-11-21T06:00:00Z', reason: 'Vacaciones' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ startsAt: '2026-11-20T06:00:00.000Z', endsAt: '2026-11-21T06:00:00.000Z', reason: 'Vacaciones' });
    expect((await as(d).post(`${BASE}/time-off`).send({ startsAt: '2026-11-21T06:00:00Z', endsAt: '2026-11-20T06:00:00Z' })).status).toBe(400);
    expect((await as(d).post(`${BASE}/time-off`).send({ startsAt: 'mañana', endsAt: '2026-11-20T06:00:00Z' })).status).toBe(400);
    expect((await as(other).delete(`${BASE}/time-off/${created.body.id}`)).status).toBe(404);
    expect((await as(d).delete(`${BASE}/time-off/no-es-uuid`)).status).toBe(400);
    expect((await as(d).delete(`${BASE}/time-off/${created.body.id}`)).status).toBe(204);
    expect((await as(d).get(BASE)).body.timeOff).toEqual([]);

    const doctorProfileId = world.doctor.profiles.find((p) => p.userProfileId === world.store.state.userProfiles.find((u) => u.userId === d)!.id)!.id;
    const pastId = randomUUID();
    agenda.seedTimeOff({ id: pastId, doctorId: doctorProfileId, startsAt: new Date('2026-10-01T06:00:00Z'), endsAt: new Date('2026-10-02T06:00:00Z'), reason: null });
    const ended = await as(d).delete(`${BASE}/time-off/${pastId}`);
    expect(ended.status).toBe(422);
  });

  it('[TC-M07-045][D-2] un médico sin canOperate consulta (200) pero no modifica (422)', async () => {
    const d = await doctor(false);
    expect((await as(d).get(BASE)).body.canOperate).toBe(false);
    expect((await as(d).put(`${BASE}/duration`).send({ minutes: 45 })).status).toBe(422);
    expect((await as(d).put(`${BASE}/availability`).send({ windows: [] })).status).toBe(422);
    expect((await as(d).post(`${BASE}/time-off`).send({ startsAt: '2026-11-20T06:00:00Z', endsAt: '2026-11-21T06:00:00Z' })).status).toBe(422);
  });

  it('[TC-M07-046][RF-10][RF-11][D-5] GET slots: horarios libres; rango > 31 días o > 90 días → 400', async () => {
    const d = await doctor();
    await as(d).put(`${BASE}/availability`).send({ windows: [{ weekday: 1, start: '09:00', end: '10:00' }] });
    await as(d).post(`${BASE}/time-off`).send({ startsAt: '2026-11-16T06:00:00Z', endsAt: '2026-11-17T06:00:00Z' });
    const res = await as(d).get(`${BASE}/slots?from=2026-11-09&to=2026-11-22`);
    expect(res.status).toBe(200);
    expect(res.body.timeZone).toBe('America/Mexico_City');
    expect(res.body.slots.map((s: { date: string; start: string }) => `${s.date} ${s.start}`)).toEqual(['2026-11-09 09:00', '2026-11-09 09:30']);
    expect((await as(d).get(`${BASE}/slots?from=2026-11-09&to=2026-12-10`)).status).toBe(400);
    expect((await as(d).get(`${BASE}/slots?from=2027-02-01&to=2027-02-07`)).status).toBe(400);
    expect((await as(d).get(`${BASE}/slots?from=09-11-2026&to=2026-11-10`)).status).toBe(400);
  });
});
