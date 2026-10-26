import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { FakeDocumentStorage } from '../../../../../test/support/identity-in-memory';
import { InMemoryDoctorAuditTrail, InMemoryDoctorUnitOfWork, InMemoryDoctorWorld } from '../../../../../test/support/doctors-world';
import { syntheticCurp } from '../../../../../test/support/synthetic-identity';
import { ProfileAlreadyExistsError, RegistrationDataConflictError } from '../../../identity/domain/identity.errors';
import { InvalidDocumentFileError } from '../../../private-storage/domain/private-storage.errors';
import { DoctorStatusService } from '../doctor-status.service';
import { DoctorIdentityDocumentPurger } from './doctor-identity-document-purger';
import { RegisterDoctorProfileUseCase } from './register-doctor-profile.use-case';
import { GetDoctorProfileUseCase, UpdateDoctorProfileUseCase } from './doctor-profile.use-cases';
import { ChangeDoctorIdentityUseCase, ChangeDoctorSpecialtyUseCase } from './doctor-changes.use-cases';
import { SubmitDoctorIdentityVerificationUseCase, SubmitDoctorLicenseVerificationUseCase } from './doctor-submissions.use-cases';
import { GetDoctorStatusUseCase, GetDoctorVerificationHistoryUseCase } from './doctor-status.use-cases';
import { DoctorProfileRequiredError, NoChangesError, SpecialtyInactiveError } from '../../domain/doctor.errors';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.7 sintetico');

function setup() {
  const world = new InMemoryDoctorWorld();
  const uow = new InMemoryDoctorUnitOfWork(world);
  const audit = new InMemoryDoctorAuditTrail(world);
  const storage = new FakeDocumentStorage();
  const status = new DoctorStatusService(world, world);
  const purger = new DoctorIdentityDocumentPurger(storage, world);
  return {
    world, uow, audit, storage,
    register: new RegisterDoctorProfileUseCase(uow, audit, world, world, world.catalog),
    profile: new GetDoctorProfileUseCase(world, world, world.catalog),
    update: new UpdateDoctorProfileUseCase(uow, world, world),
    changeIdentity: new ChangeDoctorIdentityUseCase(uow, audit, world, world, world, status, purger),
    changeSpecialty: new ChangeDoctorSpecialtyUseCase(uow, audit, world, world, world.catalog, status),
    submitIne: new SubmitDoctorIdentityVerificationUseCase(uow, audit, storage, world, world, status, purger),
    submitLicense: new SubmitDoctorLicenseVerificationUseCase(uow, audit, storage, world, world, status),
    status: new GetDoctorStatusUseCase(world, status),
    history: new GetDoctorVerificationHistoryUseCase(world, status),
  };
}
type Env = ReturnType<typeof setup>;

const anonymous = (): Actor => ({ userId: `medico-${randomUUID()}`, userProfileId: null, role: null, ipAddress: '127.0.0.1', userAgent: 'jest' });

async function newDoctor(env: Env, extra: { legal?: boolean } = {}) {
  const actor = anonymous();
  const general = env.world.catalog.byCode('medicina_general');
  const { doctorProfileId, userProfileId } = await env.register.execute(actor, { firstName: 'Ana', lastName: 'Pérez', curp: syntheticCurp(), specialtyId: general.id });
  if (extra.legal !== false) env.world.acceptDoctorRegime(userProfileId);
  return { actor: { ...actor, userProfileId, role: 'doctor' } as Actor, doctorProfileId, userProfileId };
}

// Médico con INE y cédula enviadas y aprobadas (la revisión del admin se simula; B6 la implementará).
async function approvedDoctor(env: Env) {
  const d = await newDoctor(env);
  await env.submitIne.execute(d.actor, { front: JPEG, back: JPEG });
  await env.submitLicense.execute(d.actor, { licenseNumber: `L${randomUUID().slice(0, 6)}`, document: PDF });
  env.world.review('identity', d.doctorProfileId, 'approved');
  env.world.review('license', d.doctorProfileId, 'approved');
  return d;
}
const actions = (env: Env) => env.world.audit.map((e) => e.action);

describe('Registro del médico (M03 B5: RF-05, D-1, D-17, D-33)', () => {
  it('[TC-M03-130][RF-05] crea user_profile doctor y doctor_profile; ambas líneas required; evento doctor.profile.created', async () => {
    const env = setup();
    const d = await newDoctor(env);
    expect(env.world.store.state.userProfiles.find((p) => p.id === d.userProfileId)?.role).toBe('doctor');
    expect(env.world.profileRow(d.doctorProfileId)).toMatchObject({ identityRevision: 1, professionalRevision: 1, licenseNumber: null });
    expect(actions(env)).toEqual(['doctor.profile.created']);
    expect(await env.status.execute(d.actor)).toMatchObject({ status: 'pending', identity: 'required', professional: 'required', registrationComplete: false, missing: ['identity_submission', 'license_submission'] });
  });

  it('[TC-M03-131][D-33] especialidad inactiva → 422 sin crear nada', async () => {
    const env = setup();
    const psico = env.world.catalog.byCode('psicologia');
    await env.world.catalog.setActive(psico.id, false);
    await expect(env.register.execute(anonymous(), { firstName: 'A', lastName: 'B', curp: syntheticCurp(), specialtyId: psico.id })).rejects.toThrow(SpecialtyInactiveError);
    expect(env.world.store.state.userProfiles).toHaveLength(0);
  });

  it('[TC-M03-132][D-17][D-20] CURP de otra cuenta (de cualquier rol) → 409 genérico, sin escribir ni auditar; una cuenta con perfil → 409', async () => {
    const env = setup();
    const curp = syntheticCurp();
    await env.world.store.createPatient({ userId: 'paciente', firstName: 'P', lastName: 'Q', curp, birthDate: '1990-01-01', phone: null, emergencyContactName: null, emergencyContactPhone: null });
    const general = env.world.catalog.byCode('medicina_general').id;
    await expect(env.register.execute(anonymous(), { firstName: 'A', lastName: 'B', curp, specialtyId: general })).rejects.toThrow(RegistrationDataConflictError);
    expect(env.world.doctor.profiles).toHaveLength(0);
    expect(env.world.audit).toHaveLength(0);
    const d = await newDoctor(env);
    await expect(env.register.execute(d.actor, { firstName: 'A', lastName: 'B', curp: syntheticCurp(), specialtyId: general })).rejects.toThrow(ProfileAlreadyExistsError);
  });

  it('[TC-M03-133][D-10] si la auditoría falla no queda ni el user_profile ni el perfil (misma UoW)', async () => {
    const env = setup();
    env.world.failAudit = true;
    await expect(newDoctor(env)).rejects.toThrow();
    expect(env.world.store.state.userProfiles).toHaveLength(0);
    expect(env.world.doctor.profiles).toHaveLength(0);
  });
});

describe('Envíos de INE y cédula (M03 B5: D-19, D-4, 7bis.1)', () => {
  it('[TC-M03-134][D-19][E.1] INE: un envío nuevo con uno pendiente lo pasa a superseded y se purgan sus imágenes', async () => {
    const env = setup();
    const d = await newDoctor(env);
    const first = await env.submitIne.execute(d.actor, { front: JPEG, back: JPEG });
    const firstKeys = [...env.storage.objects.keys()];
    const second = await env.submitIne.execute(d.actor, { front: JPEG, back: JPEG });
    expect([first.attempt, second.attempt]).toEqual([1, 2]);
    expect(env.world.doctor.identity.map((r) => r.status)).toEqual(['superseded', 'pending']);
    expect(env.world.doctor.identity[0]).toMatchObject({ frontObjectKey: null, backObjectKey: null });
    expect(env.storage.deleted.sort()).toEqual(firstKeys.sort());
    expect(actions(env)).toEqual(['doctor.profile.created', 'doctor.identity_verification.submitted', 'doctor.identity_verification.superseded', 'doctor.identity_verification.submitted']);
  });

  it('[TC-M03-135][R-14] archivo que no es JPEG/PNG → 400 sin subir; si la BD falla después de subir, se eliminan los objetos', async () => {
    const env = setup();
    const d = await newDoctor(env);
    await expect(env.submitIne.execute(d.actor, { front: PDF, back: JPEG })).rejects.toThrow(InvalidDocumentFileError);
    expect(env.storage.objects.size).toBe(0);
    env.world.failAudit = true;
    await expect(env.submitIne.execute(d.actor, { front: JPEG, back: JPEG })).rejects.toThrow();
    expect(env.storage.objects.size).toBe(0);
    expect(env.world.doctor.identity).toHaveLength(0);
  });

  it('[TC-M03-136][D-1][7bis.1] cédula inicial: fija el número, sube la versión a 2 y crea initial con la evidencia del perfil', async () => {
    const env = setup();
    const d = await newDoctor(env);
    const r = await env.submitLicense.execute(d.actor, { licenseNumber: ' 1234567 ', document: PDF });
    expect(r).toMatchObject({ attempt: 1, reason: 'initial' });
    expect(env.world.profileRow(d.doctorProfileId)).toMatchObject({ licenseNumber: '1234567', professionalRevision: 2 });
    expect(env.world.doctor.license[0]).toMatchObject({ revision: 2, licenseNumber: '1234567', status: 'pending' });
    await expect(env.submitLicense.execute(d.actor, { licenseNumber: '1234567' })).rejects.toThrow(InvalidDocumentFileError);
  });

  it('[TC-M03-137][D-17] número de cédula de otro médico → 409 genérico, sin cambios y con el objeto eliminado', async () => {
    const env = setup();
    const a = await newDoctor(env);
    const b = await newDoctor(env);
    await env.submitLicense.execute(a.actor, { licenseNumber: 'DUP-1', document: PDF });
    const before = env.storage.objects.size;
    await expect(env.submitLicense.execute(b.actor, { licenseNumber: 'DUP-1', document: PDF })).rejects.toThrow(RegistrationDataConflictError);
    expect(env.world.profileRow(b.doctorProfileId)).toMatchObject({ licenseNumber: null, professionalRevision: 1 });
    expect(env.storage.objects.size).toBe(before);
  });

  it('[TC-M03-138][D-4][D-21] reenvío tras rechazo sin versión nueva; cambio de documento y de número con versión nueva y superseded', async () => {
    const env = setup();
    const d = await newDoctor(env);
    await env.submitLicense.execute(d.actor, { licenseNumber: 'N1', document: PDF });
    env.world.review('license', d.doctorProfileId, 'rejected');
    expect((await env.submitLicense.execute(d.actor, { licenseNumber: 'N1', document: PDF })).reason).toBe('resubmission');
    expect(env.world.profileRow(d.doctorProfileId).professionalRevision).toBe(2);
    expect((await env.submitLicense.execute(d.actor, { licenseNumber: 'N1', document: PDF })).reason).toBe('license_document_changed');
    expect((await env.submitLicense.execute(d.actor, { licenseNumber: 'N2', document: PDF })).reason).toBe('license_number_changed');
    expect(env.world.profileRow(d.doctorProfileId)).toMatchObject({ licenseNumber: 'N2', professionalRevision: 4 });
    expect(env.world.doctor.license.map((r) => r.status)).toEqual(['rejected', 'superseded', 'superseded', 'pending']);
    const history = await env.history.execute(d.actor);
    expect(history.license.map((h) => h.reason)).toEqual(['initial', 'resubmission', 'license_document_changed', 'license_number_changed']);
    expect(JSON.stringify(history)).not.toMatch(/doctor-licenses\//);
  });

  it('[TC-M03-139][D-24][R-7] flujo hasta approved: doctor.registration.completed se registra una sola vez', async () => {
    const env = setup();
    const d = await approvedDoctor(env);
    expect(await env.status.execute(d.actor)).toMatchObject({ status: 'approved', registrationComplete: true, missing: [] });
    expect(actions(env).filter((a) => a === 'doctor.registration.completed')).toHaveLength(1);
  });
});

describe('Cambios sensibles (M03 B5: E.3, 7ter)', () => {
  it('[TC-M03-140][7ter.3] aprobado que cambia el nombre: ambas versiones +1, sin INE nueva, legal_name_changed con la misma clave y vuelta a pending', async () => {
    const env = setup();
    const d = await approvedDoctor(env);
    const keyBefore = env.world.doctor.license[0].documentObjectKey;
    const start = env.world.audit.length;
    const r = await env.changeIdentity.execute(d.actor, { lastName: 'Pérez López' });
    expect(r).toMatchObject({ identityRevision: 2, professionalRevision: 3, status: { status: 'pending', identity: 'required', professional: 'pending' } });
    expect(env.world.doctor.identity).toHaveLength(1);
    expect(env.world.doctor.license.at(-1)).toMatchObject({ reason: 'legal_name_changed', documentObjectKey: keyBefore, revision: 3, status: 'pending' });
    expect(env.world.audit.slice(start).map((e) => e.action)).toEqual(['doctor.license_verification.submitted', 'doctor.legal_name.changed', 'doctor.status.returned_to_pending']);
    expect(env.world.store.state.userProfiles.find((p) => p.id === d.userProfileId)?.lastName).toBe('Pérez López');
    const metadata = JSON.stringify(env.world.audit.slice(start).map((e) => e.metadata));
    expect(metadata).not.toMatch(/Pérez|doctor-licenses/);
  });

  it('[TC-M03-141][7bis.1] con la cédula rechazada, el cambio de nombre no crea revisión automática y la línea queda required', async () => {
    const env = setup();
    const d = await newDoctor(env);
    await env.submitLicense.execute(d.actor, { licenseNumber: 'R1', document: PDF });
    env.world.review('license', d.doctorProfileId, 'rejected');
    const r = await env.changeIdentity.execute(d.actor, { firstName: 'Ana María' });
    expect(r.status).toMatchObject({ professional: 'required' });
    expect(env.world.doctor.license).toHaveLength(1);
  });

  it('[TC-M03-142][D-28] solo la CURP: sube solo la identidad, la INE pendiente pasa a superseded y se purga; sin revisión de cédula', async () => {
    const env = setup();
    const d = await newDoctor(env);
    await env.submitIne.execute(d.actor, { front: JPEG, back: JPEG });
    const r = await env.changeIdentity.execute(d.actor, { curp: syntheticCurp() });
    expect(r).toMatchObject({ identityRevision: 2, professionalRevision: 1, status: { identity: 'required' } });
    expect(env.world.doctor.identity[0]).toMatchObject({ status: 'superseded', frontObjectKey: null });
    expect(env.world.doctor.license).toHaveLength(0);
    expect(actions(env)).toContain('doctor.curp.changed');
  });

  it('[TC-M03-143][D-17] CURP de otra persona → 409 genérico y nada cambia; sin cambios reales → 400', async () => {
    const env = setup();
    const a = await newDoctor(env);
    const b = await newDoctor(env);
    const curpA = env.world.store.state.userProfiles.find((p) => p.id === a.userProfileId)!.curp!;
    await expect(env.changeIdentity.execute(b.actor, { curp: curpA })).rejects.toThrow(RegistrationDataConflictError);
    expect(env.world.profileRow(b.doctorProfileId).identityRevision).toBe(1);
    await expect(env.changeIdentity.execute(b.actor, { firstName: ' Ana ' })).rejects.toThrow(NoChangesError);
    await expect(env.changeIdentity.execute(b.actor, {})).rejects.toThrow(NoChangesError);
  });

  it('[TC-M03-144][D-33][E.3] cambio de especialidad de un aprobado: specialty_changed con el mismo documento; inactiva → 422; la misma → 400', async () => {
    const env = setup();
    const d = await approvedDoctor(env);
    const psico = env.world.catalog.byCode('psicologia');
    const r = await env.changeSpecialty.execute(d.actor, psico.id);
    expect(r).toMatchObject({ professionalRevision: 3, status: { status: 'pending', professional: 'pending' } });
    expect(env.world.doctor.license.at(-1)).toMatchObject({ reason: 'specialty_changed', specialtyId: psico.id, documentObjectKey: env.world.doctor.license[0].documentObjectKey });
    expect(actions(env)).toEqual(expect.arrayContaining(['doctor.specialty.changed', 'doctor.status.returned_to_pending']));
    await expect(env.changeSpecialty.execute(d.actor, psico.id)).rejects.toThrow(NoChangesError);
    const infecto = env.world.catalog.byCode('infectologia');
    await env.world.catalog.setActive(infecto.id, false);
    await expect(env.changeSpecialty.execute(d.actor, infecto.id)).rejects.toThrow(SpecialtyInactiveError);
  });

  it('[TC-M03-145][D-9] bio y teléfono: sin versiones, sin estado nuevo y sin auditoría', async () => {
    const env = setup();
    const d = await approvedDoctor(env);
    const start = env.world.audit.length;
    await env.update.execute(d.actor, { bio: 'Infectóloga', phone: '5551234567' });
    expect(env.world.audit).toHaveLength(start);
    expect(await env.profile.execute(d.actor)).toMatchObject({ bio: 'Infectóloga', phone: '5551234567', hasPhoto: false, specialty: { code: 'medicina_general' } });
    expect((await env.status.execute(d.actor)).status).toBe('approved');
    await expect(env.update.execute(d.actor, {})).rejects.toThrow(NoChangesError);
  });

  it('[TC-M03-146][Autorización] un paciente o una cuenta sin perfil no usa las operaciones del médico (falla cerrado)', async () => {
    const env = setup();
    const patient: Actor = { ...anonymous(), userProfileId: randomUUID(), role: 'patient' };
    for (const op of [
      () => env.status.execute(patient),
      () => env.submitIne.execute(patient, { front: JPEG, back: JPEG }),
      () => env.changeIdentity.execute(patient, { firstName: 'X' }),
      () => env.submitIne.execute(anonymous(), { front: JPEG, back: JPEG }),
    ]) await expect(op()).rejects.toThrow(DoctorProfileRequiredError);
    expect(env.uow.calls).toBe(0);
  });
});
