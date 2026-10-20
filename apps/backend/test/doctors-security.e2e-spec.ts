import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createIdentityApp, SESSION_HEADER } from './support/identity-e2e';
import { InMemoryDoctorAuditTrail, InMemoryDoctorUnitOfWork, InMemoryDoctorWorld } from './support/doctors-world';
import { syntheticCurp } from './support/synthetic-identity';
import { DoctorsModule } from '../src/modules/doctors/doctors.module';
import { SPECIALTY_REPOSITORY } from '../src/modules/doctors/application/ports/specialty.repository';
import { DOCTOR_PROFILE_REPOSITORY } from '../src/modules/doctors/application/ports/doctor-profile.repository';
import { DOCTOR_REVIEW_REPOSITORY } from '../src/modules/doctors/application/ports/doctor-review.repository';
import { DOCTOR_IDENTITY_GATEWAY } from '../src/modules/identity/application/ports/doctor-identity.gateway';
import { UNIT_OF_WORK } from '../src/common/application/ports/unit-of-work';
import { AUDIT_TRAIL } from '../src/modules/audit/application/ports/audit-trail';

// M03 B8 (plan v2 §13, «Seguridad»): enumeración, IDOR, encabezados, logs sin datos personales y límites de frecuencia.
// E2E con dobles (sin BD).

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.7 sintetico');

describe('Seguridad del médico por HTTP (E2E con dobles, M03 B8)', () => {
  let app: INestApplication;
  let world: InMemoryDoctorWorld;

  beforeAll(async () => {
    world = new InMemoryDoctorWorld();
    ({ app } = await createIdentityApp({
      store: world.store,
      imports: [DoctorsModule],
      configure: (builder) =>
        builder
          .overrideProvider(UNIT_OF_WORK).useValue(new InMemoryDoctorUnitOfWork(world))
          .overrideProvider(AUDIT_TRAIL).useValue(new InMemoryDoctorAuditTrail(world))
          .overrideProvider(SPECIALTY_REPOSITORY).useValue(world.catalog)
          .overrideProvider(DOCTOR_IDENTITY_GATEWAY).useValue(world)
          .overrideProvider(DOCTOR_PROFILE_REPOSITORY).useValue(world)
          .overrideProvider(DOCTOR_REVIEW_REPOSITORY).useValue(world),
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.restoreAllMocks());

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    get: (path: string) => http().get(path).set(SESSION_HEADER, userId),
    post: (path: string) => http().post(path).set(SESSION_HEADER, userId),
  });
  const general = () => world.catalog.byCode('medicina_general').id;
  async function doctor(curp = syntheticCurp()) {
    const userId = `medico-${randomUUID()}`;
    const res = await as(userId).post('/me/doctor-profile').send({ firstName: 'Ana', lastName: 'Pérez', curp, specialtyId: general() });
    return { userId, res, curp };
  }

  it('[TC-M03-188][D-17] enumeración: CURP y número de cédula duplicados responden el MISMO estado y cuerpo; el log solo nombra el campo', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const a = await doctor();
    const curpDup = (await doctor(a.curp)).res;

    const b = await doctor();
    const c = await doctor();
    const number = `SEC${randomUUID().slice(0, 6)}`;
    await as(b.userId).post('/me/doctor/license-verifications').field('licenseNumber', number).attach('document', PDF, 'c.pdf');
    const numberDup = await as(c.userId).post('/me/doctor/license-verifications').field('licenseNumber', number).attach('document', PDF, 'c.pdf');

    expect([curpDup.status, numberDup.status]).toEqual([409, 409]);
    expect(numberDup.body).toEqual(curpDup.body);
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toMatch(/registration_conflict field=curp/);
    expect(logged).toMatch(/registration_conflict field=license_number/);
    expect(logged).not.toContain(a.curp);
    expect(logged).not.toContain(number);
  });

  it('[TC-M03-189][IDOR] el médico no llega a documentos ni revisiones ajenas: las rutas por id son solo del admin (403)', async () => {
    const a = await doctor();
    const b = await doctor();
    await as(a.userId).post('/me/doctor/identity-verifications').attach('front', JPEG, 'f.jpg').attach('back', JPEG, 'b.jpg');
    const reviewId = world.doctor.identity.at(-1)!.id;
    expect((await as(b.userId).get(`/admin/doctor-identity-verifications/${reviewId}/documents/front`)).status).toBe(403);
    expect((await as(b.userId).get(`/admin/doctor-identity-verifications/${reviewId}`)).status).toBe(403);
    // La INE propia tampoco se expone al médico (diseño v3 §J): no hay ruta de lectura de la INE en /me.
    expect((await as(a.userId).get('/me/doctor/identity-document')).status).toBe(404);
    // Su cédula: solo la propia, sin id en la ruta; sin envío → 404.
    expect((await as(b.userId).get('/me/doctor/license-document')).status).toBe(404);
  });

  it('[TC-M03-190][DT-8] límites de frecuencia: el cuarto envío de INE en una hora responde 429 con Retry-After', async () => {
    const d = await doctor();
    const send = () => as(d.userId).post('/me/doctor/identity-verifications').attach('front', JPEG, 'f.jpg').attach('back', JPEG, 'b.jpg');
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(201);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('[TC-M03-191][DT-4][R-5] un archivo mayor al límite responde 413 y un campo inesperado 400, sin subir nada', async () => {
    const d = await doctor();
    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await as(d.userId).post('/me/doctor/identity-verifications').attach('front', big, 'f.jpg').attach('back', JPEG, 'b.jpg')).status).toBe(413);
    expect((await as(d.userId).post('/me/doctor/identity-verifications').attach('front', JPEG, 'f.jpg').attach('back', JPEG, 'b.jpg').attach('extra', JPEG, 'x.jpg')).status).toBe(400);
  });

  it('[TC-M03-192][RN-122] la auditoría del médico nunca lleva CURP, nombres, número de cédula, claves ni URLs', async () => {
    const d = await doctor();
    await as(d.userId).post('/me/doctor/identity-verifications').attach('front', JPEG, 'f.jpg').attach('back', JPEG, 'b.jpg');
    await as(d.userId).post('/me/doctor/license-verifications').field('licenseNumber', 'AUD-123').attach('document', PDF, 'c.pdf');
    const metadata = JSON.stringify(world.audit.filter((e) => e.action.startsWith('doctor.')).map((e) => e.metadata));
    expect(metadata).not.toContain(d.curp);
    expect(metadata).not.toMatch(/Ana|Pérez|AUD-123|doctor-(identity|licenses)\/|https?:/);
  });
});
