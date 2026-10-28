import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createIdentityApp, SESSION_HEADER } from './support/identity-e2e';
import { InMemoryDoctorAuditTrail, InMemoryDoctorUnitOfWork, InMemoryDoctorWorld } from './support/doctors-world';
import type { FakeDocumentStorage } from './support/identity-in-memory';
import { syntheticCurp } from './support/synthetic-identity';
import { DoctorsModule } from '../src/modules/doctors/doctors.module';
import { SPECIALTY_REPOSITORY } from '../src/modules/doctors/application/ports/specialty.repository';
import { DOCTOR_PROFILE_REPOSITORY } from '../src/modules/doctors/application/ports/doctor-profile.repository';
import { DOCTOR_REVIEW_REPOSITORY } from '../src/modules/doctors/application/ports/doctor-review.repository';
import { DOCTOR_IDENTITY_GATEWAY } from '../src/modules/identity/application/ports/doctor-identity.gateway';
import { UNIT_OF_WORK } from '../src/common/application/ports/unit-of-work';
import { AUDIT_TRAIL } from '../src/modules/audit/application/ports/audit-trail';

// E2E HTTP del médico (M03 B5) con dobles en memoria: guards, pipes, interceptores de archivos y filtro reales; sin BD.

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.7 sintetico');

describe('Médico por HTTP (E2E con dobles, M03 B5)', () => {
  let app: INestApplication;
  let world: InMemoryDoctorWorld;
  let storage: FakeDocumentStorage;

  beforeAll(async () => {
    world = new InMemoryDoctorWorld();
    ({ app, storage } = await createIdentityApp({
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

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    get: (path: string) => http().get(path).set(SESSION_HEADER, userId),
    post: (path: string) => http().post(path).set(SESSION_HEADER, userId),
    put: (path: string) => http().put(path).set(SESSION_HEADER, userId),
    patch: (path: string) => http().patch(path).set(SESSION_HEADER, userId),
  });
  const general = () => world.catalog.byCode('medicina_general').id;

  async function registerDoctor() {
    const userId = `medico-${randomUUID()}`;
    const res = await as(userId).post('/me/doctor-profile').send({ firstName: 'Ana', lastName: 'Pérez', curp: syntheticCurp(), specialtyId: general() });
    expect(res.status).toBe(201);
    world.acceptDoctorRegime(res.body.userProfileId);
    return { userId, ...res.body } as { userId: string; doctorProfileId: string; userProfileId: string };
  }

  it('[TC-M03-147][RF-05] POST /me/doctor-profile: 401 sin sesión; 201; campos extra o CURP inválida → 400; repetir → 409', async () => {
    expect((await http().post('/me/doctor-profile').send({})).status).toBe(401);
    const userId = `medico-${randomUUID()}`;
    expect((await as(userId).post('/me/doctor-profile').send({ firstName: 'A', lastName: 'B', curp: 'NO-ES-CURP', specialtyId: general() })).status).toBe(400);
    expect((await as(userId).post('/me/doctor-profile').send({ firstName: 'A', lastName: 'B', curp: syntheticCurp(), specialtyId: general(), role: 'admin' })).status).toBe(400);
    const d = await registerDoctor();
    const again = await as(d.userId).post('/me/doctor-profile').send({ firstName: 'A', lastName: 'B', curp: syntheticCurp(), specialtyId: general() });
    expect(again.status).toBe(409);
  });

  it('[TC-M03-148][D-17] CURP repetida → 409 genérico sin la causa ni el valor', async () => {
    const d = await registerDoctor();
    const curp = world.store.state.userProfiles.find((p) => p.id === d.userProfileId)!.curp!;
    const res = await as(`medico-${randomUUID()}`).post('/me/doctor-profile').send({ firstName: 'A', lastName: 'B', curp, specialtyId: general() });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RegistrationDataConflictError');
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(`${curp}|curp`, 'i'));
  });

  it('[TC-M03-149][D-13][R-7] flujo por HTTP: estado required → envíos INE y cédula → pending; historial sin claves', async () => {
    const d = await registerDoctor();
    expect((await as(d.userId).get('/me/doctor/status')).body).toMatchObject({ status: 'pending', identity: 'required', professional: 'required' });

    const ine = await as(d.userId).post('/me/doctor/identity-verifications').attach('front', JPEG, 'f.jpg').attach('back', JPEG, 'b.jpg');
    expect(ine.status).toBe(201);
    const lic = await as(d.userId).post('/me/doctor/license-verifications').field('licenseNumber', `E2E${randomUUID().slice(0, 5)}`).attach('document', PDF, 'c.pdf');
    expect(lic.status).toBe(201);
    expect(lic.body.reason).toBe('initial');

    const status = await as(d.userId).get('/me/doctor/status');
    expect(status.body).toMatchObject({ status: 'pending', identity: 'pending', professional: 'pending', registrationComplete: true, missing: [] });
    const history = await as(d.userId).get('/me/doctor/verification-history');
    expect(history.body.identity).toHaveLength(1);
    expect(JSON.stringify([ine.body, lic.body, status.body, history.body])).not.toMatch(/doctor-(identity|licenses)\//);
  });

  it('[TC-M03-150][D-3][H.3] cédula sin archivo o con un tipo no permitido → 400; el médico descarga su PDF como attachment con sandbox', async () => {
    const d = await registerDoctor();
    expect((await as(d.userId).post('/me/doctor/license-verifications').field('licenseNumber', 'SINARCH')).status).toBe(400);
    expect((await as(d.userId).post('/me/doctor/license-verifications').field('licenseNumber', 'GIF1').attach('document', Buffer.from('GIF89a'), 'x.gif')).status).toBe(400);
    expect((await as(d.userId).get('/me/doctor/license-document')).status).toBe(404);
    await as(d.userId).post('/me/doctor/license-verifications').field('licenseNumber', `P${randomUUID().slice(0, 6)}`).attach('document', PDF, 'c.pdf');
    const doc = await as(d.userId).get('/me/doctor/license-document');
    expect(doc.status).toBe(200);
    expect(doc.headers['content-disposition']).toMatch(/^attachment/);
    expect(doc.headers['content-security-policy']).toBe('sandbox');
    expect(doc.headers['cache-control']).toBe('no-store');
    expect(storage.objects.size).toBeGreaterThan(0);
  });

  // TC-M03-151 retirado (C-16, RN-138): la ruta PUT /me/doctor-profile/identity ya no existe. La sustituye TC-M03-219.
  it('[TC-M03-219][RN-138][C-16] el médico no cambia su CURP ni su nombre legal: la ruta no existe y PATCH los rechaza sin cambiar nada', async () => {
    const d = await registerDoctor();
    const before = (await as(d.userId).get('/me/doctor-profile')).body;
    expect((await as(d.userId).put('/me/doctor-profile/identity').send({ lastName: 'Pérez López' })).status).toBe(404);
    expect((await http().put('/me/doctor-profile/identity').send({ curp: syntheticCurp() })).status).toBe(404);
    for (const body of [{ curp: syntheticCurp() }, { firstName: 'Otra' }, { lastName: 'Otro' }, { bio: 'Con bio', curp: syntheticCurp() }]) {
      const res = await as(d.userId).patch('/me/doctor-profile').send(body);
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/should not exist$/)]));
    }
    expect((await as(d.userId).get('/me/doctor-profile')).body).toEqual(before);
    // Los campos libres siguen funcionando.
    expect((await as(d.userId).patch('/me/doctor-profile').send({ phone: '5551234567', bio: 'Medicina general' })).status).toBe(204);
    expect((await as(d.userId).get('/me/doctor-profile')).body).toEqual({ ...before, phone: '5551234567', bio: 'Medicina general' });
  });

  it('[TC-M03-152][D-33] PUT /me/doctor-profile/specialty: UUID inválido → 400; inactiva → 422; GET y PATCH del perfil', async () => {
    const d = await registerDoctor();
    expect((await as(d.userId).put('/me/doctor-profile/specialty').send({ specialtyId: 'x' })).status).toBe(400);
    const infecto = world.catalog.byCode('infectologia');
    await world.catalog.setActive(infecto.id, false);
    expect((await as(d.userId).put('/me/doctor-profile/specialty').send({ specialtyId: infecto.id })).status).toBe(422);
    await world.catalog.setActive(infecto.id, true);
    expect((await as(d.userId).patch('/me/doctor-profile').send({ bio: 'Medicina general' })).status).toBe(204);
    expect((await as(d.userId).patch('/me/doctor-profile').send({ licenseNumber: 'X' })).status).toBe(400);
    const profile = await as(d.userId).get('/me/doctor-profile');
    expect(profile.body).toMatchObject({ doctorProfileId: d.doctorProfileId, bio: 'Medicina general', hasPhoto: false });
    expect(JSON.stringify(profile.body)).not.toMatch(/object_key|ObjectKey|https?:/);
  });

  it('[TC-M03-153][Autorización] un paciente recibe 403 en las rutas del médico; una cuenta sin perfil también', async () => {
    const patientId = `paciente-${randomUUID()}`;
    await as(patientId).post('/me/patient-profile').send({ firstName: 'P', lastName: 'Q', curp: syntheticCurp(), birthDate: '1990-01-01' });
    for (const userId of [patientId, `sin-perfil-${randomUUID()}`]) {
      expect((await as(userId).get('/me/doctor/status')).status).toBe(403);
      expect((await as(userId).put('/me/doctor-profile/specialty').send({ specialtyId: general() })).status).toBe(403);
    }
  });

  async function submitted() {
    const d = await registerDoctor();
    const ine = await as(d.userId).post('/me/doctor/identity-verifications').attach('front', JPEG, 'f.jpg').attach('back', JPEG, 'b.jpg');
    const lic = await as(d.userId).post('/me/doctor/license-verifications').field('licenseNumber', `R${randomUUID().slice(0, 6)}`).attach('document', PDF, 'c.pdf');
    return { ...d, ineId: ine.body.reviewId as string, licId: lic.body.reviewId as string };
  }
  async function admin() {
    const userId = `admin-${randomUUID()}`;
    await world.store.createAdmin({ userId, firstName: 'Admin', lastName: 'Sintético' });
    return userId;
  }

  it('[TC-M03-164][RF-06][D-27] el admin revisa por HTTP: colas, INE (imagen no-store) y aprobación de ambas → approved', async () => {
    const adminId = await admin();
    const d = await submitted();
    const queue = await as(adminId).get('/admin/doctor-identity-verifications');
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((i: { id: string }) => i.id)).toContain(d.ineId);
    const front = await as(adminId).get(`/admin/doctor-identity-verifications/${d.ineId}/documents/front`);
    expect(front.status).toBe(200);
    expect(front.headers['cache-control']).toBe('no-store');
    expect((await as(adminId).get(`/admin/doctor-identity-verifications/${d.ineId}/documents/lateral`)).status).toBe(400);
    expect((await as(adminId).post(`/admin/doctor-identity-verifications/${d.ineId}/approve`)).status).toBe(200);
    expect((await as(adminId).post(`/admin/doctor-license-verifications/${d.licId}/approve`)).body.doctorStatus.status).toBe('approved');
    expect((await as(d.userId).get('/me/doctor/status')).body.status).toBe('approved');
    expect((await as(adminId).get(`/admin/doctor-identity-verifications/${d.ineId}/documents/front`)).status).toBe(409);
    expect((await as(adminId).post(`/admin/doctor-identity-verifications/${d.ineId}/approve`)).status).toBe(409);
  });

  it('[TC-M03-165][D-25][H.3] rechazo sin motivo → 400; con motivo → 200; la cédula se descarga como attachment con sandbox', async () => {
    const adminId = await admin();
    const d = await submitted();
    expect((await as(adminId).post(`/admin/doctor-license-verifications/${d.licId}/reject`).send({ reason: 'corto' })).status).toBe(400);
    const r = await as(adminId).post(`/admin/doctor-license-verifications/${d.licId}/reject`).send({ reason: 'El número no coincide con el documento' });
    expect(r.status).toBe(200);
    expect((await as(d.userId).get('/me/doctor/status')).body).toMatchObject({ professional: 'rejected', licenseRejectionReason: 'El número no coincide con el documento' });
    const doc = await as(adminId).get(`/admin/doctor-license-verifications/${d.licId}/document`);
    expect(doc.headers['content-disposition']).toMatch(/^attachment/);
    expect(doc.headers['content-security-policy']).toBe('sandbox');
    const detail = await as(adminId).get(`/admin/doctors/${d.doctorProfileId}`);
    // Z-1: con la INE aún pendiente el estado global es pending (regla 1), aunque la cédula esté rechazada.
    expect(detail.body).toMatchObject({ doctorProfileId: d.doctorProfileId, status: 'pending', identity: 'pending', professional: 'rejected' });
    expect(JSON.stringify(detail.body)).not.toMatch(/doctor-(identity|licenses)\//);
  });

  it('[TC-M03-166][Admin] un médico recibe 403 en las rutas del admin; id no UUID → 400; inexistente → 404', async () => {
    const d = await submitted();
    expect((await as(d.userId).get('/admin/doctors')).status).toBe(403);
    expect((await as(d.userId).post(`/admin/doctor-identity-verifications/${d.ineId}/approve`)).status).toBe(403);
    const adminId = await admin();
    expect((await as(adminId).get('/admin/doctors/no-uuid')).status).toBe(400);
    expect((await as(adminId).get(`/admin/doctor-license-verifications/${randomUUID()}`)).status).toBe(404);
    expect((await as(adminId).get('/admin/doctors?status=otro')).status).toBe(400);
  });

  it('[TC-M03-171][D-31][D-A4-2] GET /me del médico trae su perfil y su estado con canOperate; el paciente conserva su contrato', async () => {
    const adminId = await admin();
    const d = await submitted();
    const before = await as(d.userId).get('/me');
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ role: 'doctor', profile: { doctorProfileId: d.doctorProfileId }, registrationStatus: { status: 'pending', canOperate: false } });
    await as(adminId).post(`/admin/doctor-identity-verifications/${d.ineId}/approve`);
    await as(adminId).post(`/admin/doctor-license-verifications/${d.licId}/approve`);
    expect((await as(d.userId).get('/me')).body.registrationStatus).toMatchObject({ status: 'approved', canOperate: true });
    const patientId = `paciente-${randomUUID()}`;
    await as(patientId).post('/me/patient-profile').send({ firstName: 'P', lastName: 'Q', curp: syntheticCurp(), birthDate: '1990-01-01' });
    const patient = (await as(patientId).get('/me')).body;
    expect(patient.role).toBe('patient');
    expect(Object.keys(patient.registrationStatus).sort()).toEqual(expect.arrayContaining(['canBookAppointments', 'missing', 'registrationComplete']));
    expect((await as(adminId).get('/me')).body).toMatchObject({ role: 'admin', profile: null, registrationStatus: null });
  });
});
