import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { FakeDocumentStorage } from '../../../../../test/support/identity-in-memory';
import { InMemoryDoctorAuditTrail, InMemoryDoctorUnitOfWork, InMemoryDoctorWorld } from '../../../../../test/support/doctors-world';
import { syntheticCurp } from '../../../../../test/support/synthetic-identity';
import { RoleProfileSectionRegistry } from '../../../identity/application/role-profile-section.registry';
import { DoctorStatusService } from '../doctor-status.service';
import { DoctorProfileSectionProvider } from '../doctor-profile-section.provider';
import { RegisterDoctorProfileUseCase } from '../use-cases/register-doctor-profile.use-case';
import { GetDoctorProfileUseCase } from '../use-cases/doctor-profile.use-cases';
import { GetDoctorStatusUseCase } from '../use-cases/doctor-status.use-cases';
import { SubmitDoctorIdentityVerificationUseCase, SubmitDoctorLicenseVerificationUseCase } from '../use-cases/doctor-submissions.use-cases';
import { ChangeDoctorSpecialtyUseCase } from '../use-cases/doctor-changes.use-cases';
import { DoctorIdentityDocumentPurger } from '../use-cases/doctor-identity-document-purger';
import { DoctorOperationalPolicy } from './doctor-operational.policy';
import { DoctorNotFoundError, DoctorNotOperationalError, DoctorProfileRequiredError } from '../../domain/doctor.errors';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
const PDF = Buffer.from('%PDF-1.7 x');

function setup() {
  const world = new InMemoryDoctorWorld();
  const uow = new InMemoryDoctorUnitOfWork(world);
  const audit = new InMemoryDoctorAuditTrail(world);
  const storage = new FakeDocumentStorage();
  const status = new DoctorStatusService(world, world);
  const purger = new DoctorIdentityDocumentPurger(storage, world);
  const registry = new RoleProfileSectionRegistry();
  const section = new DoctorProfileSectionProvider(registry, new GetDoctorProfileUseCase(world, world, world.catalog), new GetDoctorStatusUseCase(world, status));
  section.onModuleInit();
  return {
    world, registry,
    policy: new DoctorOperationalPolicy(world, status),
    register: new RegisterDoctorProfileUseCase(uow, audit, world, world, world.catalog),
    submitIne: new SubmitDoctorIdentityVerificationUseCase(uow, audit, storage, world, world, status, purger),
    submitLicense: new SubmitDoctorLicenseVerificationUseCase(uow, audit, storage, world, world, status),
    changeSpecialty: new ChangeDoctorSpecialtyUseCase(uow, audit, world, world, world.catalog, status),
  };
}
type Env = ReturnType<typeof setup>;

async function doctor(env: Env, approve: boolean) {
  const base: Actor = { userId: `medico-${randomUUID()}`, userProfileId: null, role: null, ipAddress: null, userAgent: null };
  const { doctorProfileId, userProfileId } = await env.register.execute(base, { firstName: 'Ana', lastName: 'Pérez', curp: syntheticCurp(), specialtyId: env.world.catalog.byCode('medicina_general').id });
  env.world.acceptDoctorRegime(userProfileId);
  const actor: Actor = { ...base, userProfileId, role: 'doctor' };
  await env.submitIne.execute(actor, { front: JPEG, back: JPEG });
  await env.submitLicense.execute(actor, { licenseNumber: `P${randomUUID().slice(0, 6)}`, document: PDF });
  if (approve) {
    env.world.review('identity', doctorProfileId, 'approved');
    env.world.review('license', doctorProfileId, 'approved');
  }
  return { actor, doctorProfileId };
}

describe('DoctorOperationalPolicy (M03 B7: D-13, D-23, RN-004)', () => {
  it('[TC-M03-167][RN-004] solo un médico approved opera; pending → DoctorNotOperationalError (422)', async () => {
    const env = setup();
    const ok = await doctor(env, true);
    const pending = await doctor(env, false);
    await expect(env.policy.assertCanOperate(ok.doctorProfileId)).resolves.toBeUndefined();
    await expect(env.policy.assertCanOperate(pending.doctorProfileId)).rejects.toThrow(DoctorNotOperationalError);
    expect((await env.policy.statusOf(pending.doctorProfileId)).status).toBe('pending');
    await expect(env.policy.assertCanOperate(randomUUID())).rejects.toThrow(DoctorNotFoundError);
  });

  it('[TC-M03-168][D-21][D-23] un aprobado que hace un cambio sensible deja de operar hasta la nueva aprobación', async () => {
    const env = setup();
    const d = await doctor(env, true);
    await env.changeSpecialty.execute(d.actor, env.world.catalog.byCode('psicologia').id);
    await expect(env.policy.assertCanOperate(d.doctorProfileId)).rejects.toThrow(DoctorNotOperationalError);
    env.world.review('license', d.doctorProfileId, 'approved');
    await expect(env.policy.assertCanOperate(d.doctorProfileId)).resolves.toBeUndefined();
  });

  it('[TC-M03-169][D-13] assertActorCanOperate: el propio médico aprobado obtiene su id; otro rol falla cerrado', async () => {
    const env = setup();
    const d = await doctor(env, true);
    await expect(env.policy.assertActorCanOperate(d.actor)).resolves.toBe(d.doctorProfileId);
    await expect(env.policy.assertActorCanOperate({ ...d.actor, role: 'patient' })).rejects.toThrow(DoctorProfileRequiredError);
  });
});

describe('Sección del médico en GET /me (M03 B7: D-31)', () => {
  it('[TC-M03-170][D-31] la sección registrada devuelve perfil y estado con canOperate; Identity no la resuelve para el paciente', async () => {
    const env = setup();
    const d = await doctor(env, true);
    const section = env.registry.sectionFor('doctor');
    expect(section).not.toBeNull();
    expect(await section!.registrationStatus(d.actor)).toMatchObject({ status: 'approved', registrationComplete: true, canOperate: true, missing: [] });
    expect(await section!.profile(d.actor)).toMatchObject({ doctorProfileId: d.doctorProfileId, specialty: { code: 'medicina_general' } });
    expect(env.registry.sectionFor('admin')).toBeNull();
    expect(env.registry.sectionFor(null)).toBeNull();
    expect(() => env.registry.register('patient', section!)).toThrow();
    expect(() => env.registry.register('doctor', section!)).toThrow();
  });
});
