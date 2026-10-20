import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createIdentityApp, SESSION_HEADER } from './support/identity-e2e';
import type { InMemoryIdentityStore } from './support/identity-in-memory';
import { InMemorySpecialtyCatalog } from './support/doctors-in-memory';
import { syntheticCurp } from './support/synthetic-identity';
import { DoctorsModule } from '../src/modules/doctors/doctors.module';
import { SPECIALTY_REPOSITORY } from '../src/modules/doctors/application/ports/specialty.repository';

// E2E HTTP del catálogo de especialidades (M03 B1: D-5, D-26, D-33, D-34, R-4, Z-2) con dobles en memoria:
// guards, pipes y filtro reales; sin BD.

describe('Catálogo de especialidades por HTTP (E2E con dobles)', () => {
  let app: INestApplication;
  let store: InMemoryIdentityStore;
  let catalog: InMemorySpecialtyCatalog;
  let adminId: string;
  let doctorId: string;

  beforeAll(async () => {
    catalog = InMemorySpecialtyCatalog.seeded();
    ({ app, store } = await createIdentityApp({
      imports: [DoctorsModule],
      configure: (builder) => builder.overrideProvider(SPECIALTY_REPOSITORY).useValue(catalog),
    }));
    adminId = `admin-${randomUUID()}`;
    await store.createAdmin({ userId: adminId, firstName: 'Admin', lastName: 'Sintético' });
    doctorId = `medico-${randomUUID()}`;
    store.createDoctorForTest({ userId: doctorId, firstName: 'Médico', lastName: 'Sintético', curp: syntheticCurp() });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    get: (path: string) => http().get(path).set(SESSION_HEADER, userId),
    post: (path: string) => http().post(path).set(SESSION_HEADER, userId),
    patch: (path: string) => http().patch(path).set(SESSION_HEADER, userId),
  });
  const codes = (body: { code: string }[]) => body.map((s) => s.code).sort();
  const actions = () => store.state.audit.map((e) => e.action).filter((a) => a.startsWith('catalog.'));

  it('[TC-M03-088][D-34] GET /specialties: requiere sesión (401) y una cuenta sin perfil ve las tres activas', async () => {
    expect((await http().get('/specialties')).status).toBe(401);
    const res = await as(`sin-perfil-${randomUUID()}`).get('/specialties');
    expect(res.status).toBe(200);
    expect(codes(res.body)).toEqual(['infectologia', 'medicina_general', 'psicologia']);
    expect(Object.keys(res.body[0]).sort()).toEqual(['code', 'id', 'name']);
  });

  it('[TC-M03-089][Admin] /admin/specialties: 401 sin sesión y 403 para un médico', async () => {
    expect((await http().get('/admin/specialties')).status).toBe(401);
    expect((await as(doctorId).get('/admin/specialties')).status).toBe(403);
    expect((await as(doctorId).post('/admin/specialties').send({ code: 'cardiologia', name: 'Cardiología' })).status).toBe(403);
    expect(catalog.rows).toHaveLength(3);
  });

  it('[TC-M03-090][D-5] el admin crea una especialidad (201); duplicado → 409; datos inválidos o campos extra → 400', async () => {
    const created = await as(adminId).post('/admin/specialties').send({ code: 'cardiologia', name: 'Cardiología' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'cardiologia', name: 'Cardiología', isActive: true, deactivatedAt: null });

    const dup = await as(adminId).post('/admin/specialties').send({ code: 'cardio_2', name: 'cardiología' });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ error: 'SpecialtyAlreadyExistsError', details: { field: 'name' } });

    expect((await as(adminId).post('/admin/specialties').send({ code: 'Cardio', name: 'X' })).status).toBe(400);
    expect((await as(adminId).post('/admin/specialties').send({ code: 'otra', name: 'Otra', isActive: false })).status).toBe(400);
    expect(actions()).toEqual(['catalog.specialty.created']);
  });

  it('[TC-M03-091][R-4] PATCH edita solo el nombre: enviar code → 400; id no UUID → 400; inexistente → 404', async () => {
    const target = catalog.byCode('cardiologia');
    const res = await as(adminId).patch(`/admin/specialties/${target.id}`).send({ name: 'Cardiología clínica' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 'cardiologia', name: 'Cardiología clínica' });

    expect((await as(adminId).patch(`/admin/specialties/${target.id}`).send({ name: 'X', code: 'otro' })).status).toBe(400);
    expect((await as(adminId).patch('/admin/specialties/no-es-uuid').send({ name: 'X' })).status).toBe(400);
    expect((await as(adminId).patch(`/admin/specialties/${randomUUID()}`).send({ name: 'X' })).status).toBe(404);
    expect(catalog.byCode('cardiologia').code).toBe('cardiologia');
  });

  it('[TC-M03-092][D-26][Z-2] desactivar y reactivar (200); repetir el estado → 409; nunca se borra', async () => {
    const target = catalog.byCode('psicologia');
    const off = await as(adminId).post(`/admin/specialties/${target.id}/deactivate`);
    expect(off.status).toBe(200);
    expect(off.body.isActive).toBe(false);
    expect(codes((await as(doctorId).get('/specialties')).body)).not.toContain('psicologia');
    expect(codes((await as(adminId).get('/admin/specialties')).body)).toContain('psicologia');
    expect((await as(adminId).post(`/admin/specialties/${target.id}/deactivate`)).status).toBe(409);

    const on = await as(adminId).post(`/admin/specialties/${target.id}/activate`);
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ isActive: true, deactivatedAt: null });
    expect(codes((await as(doctorId).get('/specialties')).body)).toContain('psicologia');
    expect((await as(adminId).post(`/admin/specialties/${target.id}/activate`)).status).toBe(409);

    expect(actions()).toEqual([
      'catalog.specialty.created',
      'catalog.specialty.updated',
      'catalog.specialty.deactivated',
      'catalog.specialty.activated',
    ]);
  });
});
