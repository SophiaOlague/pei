import type { Actor } from '../../../../../common/application/actor';
import {
  InMemorySpecialtyAuditTrail,
  InMemorySpecialtyCatalog,
  InMemorySpecialtyUnitOfWork,
} from '../../../../../../test/support/doctors-in-memory';
import {
  ChangeSpecialtyActivationUseCase,
  CreateSpecialtyUseCase,
  ListActiveSpecialtiesUseCase,
  ListAllSpecialtiesUseCase,
  UpdateSpecialtyUseCase,
} from './specialty.use-cases';
import {
  AdminRequiredError,
  InvalidSpecialtyCodeError,
  InvalidSpecialtyNameError,
  SpecialtyAlreadyExistsError,
  SpecialtyAlreadyInStateError,
  SpecialtyNotFoundError,
} from '../../../domain/doctor.errors';

const admin: Actor = {
  userId: 'admin-user',
  userProfileId: '00000000-0000-4000-8000-000000000001',
  role: 'admin',
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
};
const doctor: Actor = { ...admin, userId: 'doctor-user', role: 'doctor' };

function setup() {
  const catalog = InMemorySpecialtyCatalog.seeded();
  const uow = new InMemorySpecialtyUnitOfWork(catalog);
  const audit = new InMemorySpecialtyAuditTrail(catalog);
  return {
    catalog,
    uow,
    audit,
    listActive: new ListActiveSpecialtiesUseCase(catalog),
    listAll: new ListAllSpecialtiesUseCase(catalog),
    create: new CreateSpecialtyUseCase(uow, audit, catalog),
    update: new UpdateSpecialtyUseCase(uow, audit, catalog),
    activation: new ChangeSpecialtyActivationUseCase(uow, audit, catalog),
  };
}

const actions = (env: ReturnType<typeof setup>) => env.catalog.audit.map((e) => e.action);

describe('Catálogo de especialidades (M03 B1: D-5, D-26, D-33, D-34, R-4, Z-2)', () => {
  it('[TC-M03-075][D-34] el catálogo inicial tiene las tres especialidades activas; la lista pública no expone fechas ni estado', async () => {
    const env = setup();
    const list = await env.listActive.execute();
    expect(list.map((s) => s.code).sort()).toEqual(['infectologia', 'medicina_general', 'psicologia']);
    expect(Object.keys(list[0]).sort()).toEqual(['code', 'id', 'name']);
  });

  it('[TC-M03-076][D-5] el admin crea una especialidad y queda un evento catalog.specialty.created con su code', async () => {
    const env = setup();
    const created = await env.create.execute(admin, { code: 'cardiologia', name: '  Cardiología ' });
    expect(created).toMatchObject({ code: 'cardiologia', name: 'Cardiología', isActive: true, deactivatedAt: null });
    expect((await env.listActive.execute()).map((s) => s.code)).toContain('cardiologia');
    expect(env.catalog.audit).toHaveLength(1);
    expect(env.catalog.audit[0]).toMatchObject({
      action: 'catalog.specialty.created',
      entityType: 'specialty',
      entityId: created.id,
      metadata: { code: 'cardiologia' },
    });
  });

  it.each([
    ['code repetido', { code: 'psicologia', name: 'Otra' }, 'code'],
    ['nombre repetido sin distinguir mayúsculas', { code: 'psicologia_2', name: 'PSICOLOGÍA' }, 'name'],
  ])('[TC-M03-077][D-5] %s → 409 con el campo, sin escribir ni auditar', async (_label, input, field) => {
    const env = setup();
    const error = await env.create.execute(admin, input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpecialtyAlreadyExistsError);
    expect((error as SpecialtyAlreadyExistsError).details).toEqual({ field });
    expect(env.catalog.rows).toHaveLength(3);
    expect(env.catalog.audit).toHaveLength(0);
  });

  it.each([
    ['code con mayúsculas', { code: 'Cardio', name: 'Cardiología' }, InvalidSpecialtyCodeError],
    ['code de un carácter', { code: 'c', name: 'Cardiología' }, InvalidSpecialtyCodeError],
    ['nombre vacío', { code: 'cardiologia', name: '   ' }, InvalidSpecialtyNameError],
    ['nombre de 101 caracteres', { code: 'cardiologia', name: 'x'.repeat(101) }, InvalidSpecialtyNameError],
  ])('[TC-M03-078][D-5] %s → 400 sin abrir la transacción', async (_label, input, errorType) => {
    const env = setup();
    await expect(env.create.execute(admin, input)).rejects.toThrow(errorType);
    expect(env.uow.calls).toBe(0);
  });

  it('[TC-M03-079][R-4] el admin edita el nombre visible; code no cambia; el evento lleva solo el nombre del campo', async () => {
    const env = setup();
    const target = env.catalog.byCode('medicina_general');
    const updated = await env.update.execute(admin, target.id, { name: 'Medicina familiar' });
    expect(updated).toMatchObject({ id: target.id, code: 'medicina_general', name: 'Medicina familiar' });
    expect(env.catalog.audit[0]).toMatchObject({ action: 'catalog.specialty.updated', metadata: { fields: ['name'] } });
    expect(JSON.stringify(env.catalog.audit[0].metadata)).not.toContain('Medicina');
  });

  it('[TC-M03-080][R-4] el mismo nombre no escribe ni audita; un nombre de otra → 409; un id inexistente → 404', async () => {
    const env = setup();
    const target = env.catalog.byCode('psicologia');
    await env.update.execute(admin, target.id, { name: 'Psicología' });
    await expect(env.update.execute(admin, target.id, { name: 'infectología' })).rejects.toThrow(SpecialtyAlreadyExistsError);
    await expect(env.update.execute(admin, '00000000-0000-4000-8000-0000000000ff', { name: 'X' })).rejects.toThrow(
      SpecialtyNotFoundError,
    );
    expect(env.catalog.byCode('psicologia').name).toBe('Psicología');
    expect(env.catalog.audit).toHaveLength(0);
  });

  it('[TC-M03-081][D-26][Z-2] desactivar la oculta de la lista pública sin borrarla; reactivarla la devuelve; cada cambio se audita', async () => {
    const env = setup();
    const target = env.catalog.byCode('infectologia');

    const off = await env.activation.execute(admin, target.id, false);
    expect(off.isActive).toBe(false);
    expect(off.deactivatedAt).toBeInstanceOf(Date);
    expect((await env.listActive.execute()).map((s) => s.code)).not.toContain('infectologia');
    expect((await env.listAll.execute(admin)).map((s) => s.code)).toContain('infectologia');

    const on = await env.activation.execute(admin, target.id, true);
    expect(on).toMatchObject({ isActive: true, deactivatedAt: null });
    expect((await env.listActive.execute()).map((s) => s.code)).toContain('infectologia');
    expect(actions(env)).toEqual(['catalog.specialty.deactivated', 'catalog.specialty.activated']);
  });

  it('[TC-M03-082][Z-2] desactivar una inactiva o activar una activa → 409 sin evento', async () => {
    const env = setup();
    const target = env.catalog.byCode('psicologia');
    await expect(env.activation.execute(admin, target.id, true)).rejects.toThrow(SpecialtyAlreadyInStateError);
    await env.activation.execute(admin, target.id, false);
    await expect(env.activation.execute(admin, target.id, false)).rejects.toThrow(SpecialtyAlreadyInStateError);
    expect(actions(env)).toEqual(['catalog.specialty.deactivated']);
  });

  it('[TC-M03-083][D-10] si la auditoría falla, no queda ni el cambio ni el evento (misma UoW)', async () => {
    const env = setup();
    env.audit.fail = true;
    const target = env.catalog.byCode('psicologia');
    await expect(env.create.execute(admin, { code: 'cardiologia', name: 'Cardiología' })).rejects.toThrow();
    await expect(env.activation.execute(admin, target.id, false)).rejects.toThrow();
    await expect(env.update.execute(admin, target.id, { name: 'Psicoterapia' })).rejects.toThrow();
    expect(env.catalog.rows).toHaveLength(3);
    expect(env.catalog.byCode('psicologia')).toMatchObject({ name: 'Psicología', isActive: true });
  });

  it('[TC-M03-084][Admin] solo admin administra el catálogo (falla cerrado sin escribir)', async () => {
    const env = setup();
    const target = env.catalog.byCode('psicologia');
    const noProfile: Actor = { ...admin, userProfileId: null };
    for (const actor of [doctor, noProfile]) {
      await expect(env.listAll.execute(actor)).rejects.toThrow(AdminRequiredError);
      await expect(env.create.execute(actor, { code: 'cardiologia', name: 'Cardiología' })).rejects.toThrow(AdminRequiredError);
      await expect(env.update.execute(actor, target.id, { name: 'X' })).rejects.toThrow(AdminRequiredError);
      await expect(env.activation.execute(actor, target.id, false)).rejects.toThrow(AdminRequiredError);
    }
    expect(env.uow.calls).toBe(0);
  });
});
