import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import {
  FakeAdminAccountProvisioner,
  FakeDocumentStorage,
  InMemoryAuditTrail,
  InMemoryIdentityStore,
  InMemoryUnitOfWork,
} from '../../../../../test/support/identity-in-memory';
import { syntheticCurp, syntheticJpeg, syntheticPng } from '../../../../../test/support/synthetic-identity';
import { RegisterPatientProfileUseCase } from './register-patient-profile.use-case';
import { SubmitIdentityVerificationUseCase } from './submit-identity-verification.use-case';
import {
  OpenIdentityDocumentUseCase,
  PurgeReviewedIdentityDocumentsUseCase,
  ReviewIdentityVerificationUseCase,
} from './identity-verification-admin.use-cases';
import { IdentityDocumentPurger } from './identity-document-purger';
import { BootstrapAdminUseCase } from './bootstrap-admin.use-case';
import { UpdatePatientProfileUseCase, UpdateProfilePhotoUseCase } from './patient-profile.use-cases';
import { AcceptLegalDocumentsUseCase } from './legal-documents.use-cases';
import { CanBookAppointmentsPolicy } from '../policies/can-book-appointments';
import {
  AdminAlreadyExistsError,
  BootstrapAccountHasProfileError,
  IdentityDocumentUnavailableError,
  LegalDocumentNotCurrentError,
  NoEditableFieldsError,
  ProfileAlreadyExistsError,
  RegistrationDataConflictError,
  RegistrationIncompleteError,
} from '../../domain/identity.errors';
import { StoredFileNotFoundError } from '../../../private-storage/domain/private-storage.errors';

const clock = { now: () => new Date() };

function setup() {
  const store = new InMemoryIdentityStore();
  const uow = new InMemoryUnitOfWork(store);
  const audit = new InMemoryAuditTrail(store);
  const storage = new FakeDocumentStorage();
  const purger = new IdentityDocumentPurger(uow, storage, store.verifications);
  return {
    store,
    uow,
    audit,
    storage,
    register: new RegisterPatientProfileUseCase(uow, audit, clock, store, store.patientProfiles),
    submit: new SubmitIdentityVerificationUseCase(uow, audit, storage, store.patientProfiles, store.verifications),
    review: new ReviewIdentityVerificationUseCase(uow, audit, store.verifications, purger),
    open: new OpenIdentityDocumentUseCase(uow, audit, storage, store.verifications),
    purge: new PurgeReviewedIdentityDocumentsUseCase(store.verifications, purger),
  };
}

const sessionActor = (userId = `user-${randomUUID()}`): Actor => ({ userId, userProfileId: null, role: null, ipAddress: '127.0.0.1', userAgent: 'jest' });

async function patient(env: ReturnType<typeof setup>, curp = syntheticCurp()): Promise<Actor> {
  const actor = sessionActor();
  const { userProfileId } = await env.register.execute(actor, { firstName: 'Paciente', lastName: 'Sintético', curp, birthDate: '1990-01-01' });
  return { ...actor, userProfileId, role: 'patient' };
}

async function admin(env: ReturnType<typeof setup>): Promise<Actor> {
  const userId = `admin-${randomUUID()}`;
  const userProfileId = await env.store.createAdmin({ userId, firstName: 'Admin', lastName: 'Prueba' });
  return { userId, userProfileId, role: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' };
}

describe('Casos de uso de Identity con dobles en memoria (M02)', () => {
  describe('RegisterPatientProfile', () => {
    it('[TC-M02-073][RF-01][DP-5] crea user_profile con rol patient, patient_profile y el evento created en la misma UoW', async () => {
      const env = setup();
      const actor = sessionActor();
      const result = await env.register.execute(actor, { firstName: ' Ana ', lastName: 'Sintética', curp: syntheticCurp().toLowerCase(), birthDate: '1990-05-01' });

      expect(env.store.state.userProfiles).toEqual([expect.objectContaining({ id: result.userProfileId, role: 'patient', firstName: 'Ana' })]);
      // M03 R-12: la CURP (normalizada a mayúsculas) vive en user_profile.
      expect(env.store.state.userProfiles[0].curp).toMatch(/^X[AEIOUX]XX/);
      expect(env.store.state.audit.map((e) => [e.action, e.entityId, e.metadata])).toEqual([
        ['identity.patient_profile.created', result.patientProfileId, null],
      ]);
      expect(env.store.state.audit[0].actor).toMatchObject({ type: 'user', userId: actor.userId, userProfileId: result.userProfileId });
      expect(env.uow.calls).toBe(1);
      await expect(env.register.execute({ ...actor, userProfileId: result.userProfileId, role: 'patient' }, {
        firstName: 'A', lastName: 'B', curp: syntheticCurp(), birthDate: '1990-01-01',
      })).rejects.toThrow(ProfileAlreadyExistsError);
    });

    it('[TC-M02-074][DT-22] CURP duplicada → 409 genérico sin el valor, también si la gana una carrera (23505)', async () => {
      const env = setup();
      const curp = syntheticCurp();
      await patient(env, curp);

      const error = await env.register.execute(sessionActor(), { firstName: 'Otra', lastName: 'Cuenta', curp, birthDate: '1991-01-01' }).catch((e) => e);
      expect(error).toBeInstanceOf(RegistrationDataConflictError);
      expect(error.message).toBe('No fue posible completar el registro con los datos proporcionados');
      expect(error.message).not.toContain(curp);

      // Carrera: la comprobación previa no ve el duplicado, pero el INSERT viola la unicidad.
      jest.spyOn(env.store, 'existsByCurp').mockResolvedValueOnce(false);
      jest.spyOn(env.store, 'createPatient').mockRejectedValueOnce(
        new UniqueConstraintViolationError({ code: '23505', constraint: 'user_profile_curp_unique' }),
      );
      await expect(env.register.execute(sessionActor(), { firstName: 'Otra', lastName: 'Cuenta', curp, birthDate: '1991-01-01' })).rejects.toThrow(RegistrationDataConflictError);
      expect(env.store.state.userProfiles).toHaveLength(1);
      expect(env.store.state.audit).toHaveLength(1);
    });

    it('[TC-M03-052][D-17][M01-D2] el conflicto se registra solo en un log warn sin datos personales; nada en audit_log', async () => {
      const env = setup();
      const curp = syntheticCurp();
      await patient(env, curp);
      const auditBefore = env.store.state.audit.length;
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const actor = sessionActor();
      await expect(
        env.register.execute(actor, { firstName: 'Nombre', lastName: 'Visible', curp, birthDate: '1991-01-01' }),
      ).rejects.toThrow(RegistrationDataConflictError);

      expect(warn).toHaveBeenCalledWith('registration_conflict field=curp');
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain(curp);
      expect(logged).not.toContain(actor.userId);
      expect(logged).not.toMatch(/Nombre|Visible/);
      expect(env.store.state.audit).toHaveLength(auditBefore);
      warn.mockRestore();
    });

    it('[TC-M03-053][D-20][D-35] la CURP es única entre roles: la de un médico existente bloquea el registro de un paciente', async () => {
      const env = setup();
      const curp = syntheticCurp();
      env.store.createDoctorForTest({ userId: `medico-${randomUUID()}`, firstName: 'M', lastName: 'D', curp });
      await expect(
        env.register.execute(sessionActor(), { firstName: 'P', lastName: 'Q', curp, birthDate: '1990-01-01' }),
      ).rejects.toThrow(RegistrationDataConflictError);
      expect(env.store.state.patientProfiles).toHaveLength(0);
    });
  });

  describe('SubmitIdentityVerification', () => {
    it('[TC-M02-075][RF-07][DT-3] sube frente y reverso con claves del servidor, crea el envío pending (intento 1) y audita', async () => {
      const env = setup();
      const actor = await patient(env);
      const result = await env.submit.execute(actor, { front: syntheticJpeg(), back: syntheticPng() });

      const [row] = env.store.state.verifications;
      expect(result).toEqual({ submissionId: row.id, status: 'pending', attempt: 1 });
      expect(row.frontObjectKey).toMatch(new RegExp(`^identity/${row.patientProfileId}/${row.id}/front\\.jpg$`));
      expect(row.backObjectKey).toMatch(/\/back\.png$/);
      expect([...env.storage.objects.keys()].sort((a, b) => a.localeCompare(b))).toEqual([row.backObjectKey!, row.frontObjectKey!].sort((a, b) => a.localeCompare(b)));
      expect(env.store.state.audit.at(-1)).toMatchObject({ action: 'identity.identity_verification.submitted', entityId: row.id, metadata: { attempt: 1 } });
    });

    it('[TC-M02-076][DT-6] si la BD falla después de subir, se eliminan los objetos subidos (compensación) y no queda envío ni evento', async () => {
      const env = setup();
      const actor = await patient(env);
      const auditBefore = env.store.state.audit.length;
      env.uow.failNext = new Error('fallo simulado de la BD');

      await expect(env.submit.execute(actor, { front: syntheticJpeg(), back: syntheticJpeg() })).rejects.toThrow('fallo simulado de la BD');
      expect(env.storage.objects.size).toBe(0);
      expect(env.storage.deleted).toHaveLength(2);
      expect(env.store.state.verifications).toHaveLength(0);
      expect(env.store.state.audit).toHaveLength(auditBefore);
    });
  });

  describe('Revisión, acceso y purga', () => {
    async function pendingSubmission() {
      const env = setup();
      const actor = await patient(env);
      const { submissionId } = await env.submit.execute(actor, { front: syntheticJpeg(), back: syntheticPng() });
      return { env, actor, submissionId, reviewer: await admin(env) };
    }

    it('[TC-M02-077][DT-5] aprobar: estado, auditoría y eliminación de los dos objetos después del commit; claves en NULL', async () => {
      const { env, submissionId, reviewer } = await pendingSubmission();
      const result = await env.review.execute(reviewer, submissionId, { decision: 'approve' });

      expect(result).toEqual({ submissionId, status: 'approved', attempt: 1, documentsDeleted: true });
      expect(env.storage.objects.size).toBe(0);
      expect(env.store.state.verifications[0]).toMatchObject({ status: 'approved', frontObjectKey: null, backObjectKey: null, documentsDeletedAt: expect.any(Date) });
      expect(env.store.state.audit.at(-1)).toMatchObject({ action: 'identity.identity_verification.approved', metadata: { attempt: 1 } });
    });

    it('[TC-M02-078][DT-5][DT-6] si la eliminación falla, la revisión no se revierte y el CLI de purga la completa', async () => {
      const { env, submissionId, reviewer } = await pendingSubmission();
      env.storage.failDelete = true;
      const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      const result = await env.review.execute(reviewer, submissionId, { decision: 'reject', reason: 'La imagen es ilegible' });
      expect(result).toMatchObject({ status: 'rejected', documentsDeleted: false });
      expect(env.store.state.verifications[0]).toMatchObject({ status: 'rejected', rejectionReason: 'La imagen es ilegible', documentsDeletedAt: null });
      expect(env.storage.objects.size).toBe(2);
      expect(logError.mock.calls[0][0]).toMatch(/^No se pudieron eliminar los documentos del envío [0-9a-f-]{36}: Error$/);
      logError.mockRestore();

      env.storage.failDelete = false;
      expect(await env.purge.execute()).toEqual({ found: 1, purged: 1, failed: 0 });
      expect(env.storage.objects.size).toBe(0);
      expect(env.store.state.verifications[0]).toMatchObject({ frontObjectKey: null, backObjectKey: null, documentsDeletedAt: expect.any(Date) });
      expect(await env.purge.execute()).toEqual({ found: 0, purged: 0, failed: 0 });
    });

    it('[TC-M02-079][DP-15][RNF-08] ver un documento audita el lado antes de transmitirlo; después de resolver → 409 sin evento', async () => {
      const { env, submissionId, reviewer } = await pendingSubmission();
      const file = await env.open.execute(reviewer, submissionId, 'back');
      expect(file.contentType).toBe('image/png');
      expect(env.store.state.audit.at(-1)).toMatchObject({ action: 'identity.identity_document.viewed', metadata: { side: 'back' } });

      await env.review.execute(reviewer, submissionId, { decision: 'approve' });
      const auditCount = env.store.state.audit.length;
      await expect(env.open.execute(reviewer, submissionId, 'front')).rejects.toThrow(IdentityDocumentUnavailableError);
      expect(env.store.state.audit).toHaveLength(auditCount);
    });

    it('[TC-M02-091][DT-3] una fila anterior a M02 con URL en lugar de clave no se transmite ni se envía a R2', async () => {
      const { env, submissionId, reviewer } = await pendingSubmission();
      const row = env.store.state.verifications[0];
      row.frontObjectKey = 'https://example.test/patient-ine/legado.jpg';
      await expect(env.open.execute(reviewer, submissionId, 'front')).rejects.toThrow(StoredFileNotFoundError);

      await env.review.execute(reviewer, submissionId, { decision: 'approve' });
      expect(env.storage.deleted).not.toContain('https://example.test/patient-ine/legado.jpg');
      expect(env.store.state.verifications[0].documentsDeletedAt).toEqual(expect.any(Date));
    });
  });

  describe('BootstrapAdmin (DT-12)', () => {
    function bootstrapSetup() {
      const store = new InMemoryIdentityStore();
      const accounts = new FakeAdminAccountProvisioner();
      const useCase = new BootstrapAdminUseCase(new InMemoryUnitOfWork(store), new InMemoryAuditTrail(store), store, accounts);
      return { store, accounts, useCase };
    }
    const input = { email: 'admin@example.test', firstName: 'Admin', lastName: 'Inicial' };

    it('[TC-M02-092][DP-5][DT-12] primera ejecución: cuenta, perfil admin, evento con actor sistema y enlace de contraseña; segunda: aborta', async () => {
      const { store, accounts, useCase } = bootstrapSetup();
      const result = await useCase.execute(input);

      expect(result.resumedExistingAccount).toBe(false);
      expect(store.state.userProfiles).toEqual([expect.objectContaining({ id: result.userProfileId, role: 'admin' })]);
      expect(store.state.audit).toEqual([
        expect.objectContaining({ action: 'identity.admin.bootstrapped', entityId: result.userProfileId, metadata: { systemProcess: 'cli.admin-bootstrap' } }),
      ]);
      expect(accounts.passwordSetups).toEqual(['admin@example.test']);

      await expect(useCase.execute({ ...input, email: 'otro@example.test' })).rejects.toThrow(AdminAlreadyExistsError);
      expect(accounts.accounts.has('otro@example.test')).toBe(false);
      expect(store.state.userProfiles).toHaveLength(1);
    });

    it('[TC-M02-093][DT-12] reanuda una cuenta creada sin perfil; una cuenta con perfil aborta', async () => {
      const { store, accounts, useCase } = bootstrapSetup();
      accounts.accounts.set('admin@example.test', 'ba-existente');
      expect(await useCase.execute(input)).toMatchObject({ resumedExistingAccount: true });

      const other = bootstrapSetup();
      other.accounts.accounts.set('admin@example.test', 'ba-paciente');
      await other.store.createPatient({ userId: 'ba-paciente', firstName: 'P', lastName: 'Q', curp: syntheticCurp(), birthDate: '1990-01-01', phone: null, emergencyContactName: null, emergencyContactPhone: null });
      await expect(other.useCase.execute(input)).rejects.toThrow(BootstrapAccountHasProfileError);
      expect(store.state.userProfiles.filter((p) => p.role === 'admin')).toHaveLength(1);
    });
  });

  describe('Perfil, legales y política de agendar', () => {
    it('[TC-M02-094][DP-12] solo se actualizan los campos editables y se auditan sus nombres, no sus valores', async () => {
      const env = setup();
      const actor = await patient(env);
      const update = new UpdatePatientProfileUseCase(env.uow, env.audit, env.store.patientProfiles);

      const result = await update.execute(actor, { phone: '5551234567', address: 'Calle Sintética 1', curp: 'X', firstName: 'Y' } as any);
      expect(result.updated.sort()).toEqual(['address', 'phone']);
      const view = await env.store.patientProfiles.findByUserProfileId(actor.userProfileId!);
      expect(view).toMatchObject({ phone: '5551234567', address: 'Calle Sintética 1', firstName: 'Paciente' });
      expect(env.store.state.audit.at(-1)).toMatchObject({ action: 'identity.patient_profile.updated', metadata: { fields: ['address', 'phone'] } });
      expect(JSON.stringify(env.store.state.audit.at(-1)!.metadata)).not.toContain('555');
      await expect(update.execute(actor, {})).rejects.toThrow(NoEditableFieldsError);
    });

    it('[TC-M02-095][DT-7] foto: reemplaza la clave, elimina la anterior después del commit y compensa si la BD falla', async () => {
      const env = setup();
      const actor = await patient(env);
      const photo = new UpdateProfilePhotoUseCase(env.uow, env.audit, env.storage, env.store.patientProfiles);

      await photo.execute(actor, syntheticJpeg());
      const first = (await env.store.patientProfiles.findByUserProfileId(actor.userProfileId!))!.photoObjectKey!;
      await photo.execute(actor, syntheticPng());
      const second = (await env.store.patientProfiles.findByUserProfileId(actor.userProfileId!))!.photoObjectKey!;
      expect(first).toMatch(/^profile-photos\/.+\.jpg$/);
      expect(second).toMatch(/^profile-photos\/.+\.png$/);
      expect([...env.storage.objects.keys()]).toEqual([second]);

      env.uow.failNext = new Error('fallo simulado de la BD');
      await expect(photo.execute(actor, syntheticJpeg())).rejects.toThrow('fallo simulado');
      expect([...env.storage.objects.keys()]).toEqual([second]);
    });

    it('[TC-M02-096][RF-03][RF-04] una versión legal que no es la vigente → 409 sin guardar nada; repetir la vigente es idempotente', async () => {
      const env = setup();
      const actor = await patient(env);
      const old = env.store.publishLegalDocument('privacy_notice', 'v1', new Date(Date.now() - 120_000));
      const privacy = env.store.publishLegalDocument('privacy_notice', 'v2');
      const terms = env.store.publishLegalDocument('terms_and_conditions', 'v1');
      const accept = new AcceptLegalDocumentsUseCase(env.uow, env.audit, env.store);

      await expect(accept.execute(actor, [old.id, terms.id])).rejects.toThrow(LegalDocumentNotCurrentError);
      expect(env.store.state.acceptances).toHaveLength(0);

      await accept.execute(actor, [privacy.id, terms.id]);
      await accept.execute(actor, [privacy.id]);
      expect(env.store.state.acceptances).toEqual([
        expect.objectContaining({ legalDocumentId: privacy.id, ipAddress: '127.0.0.1', userAgent: 'jest' }),
        expect.objectContaining({ legalDocumentId: terms.id }),
      ]);
    });

    it('[TC-M02-097][DP-8][DT-21] assertCanBookAppointments falla con la lista missing y pasa con el registro completo', async () => {
      const env = setup();
      const actor = await patient(env);
      const policy = new CanBookAppointmentsPolicy(env.store);
      const privacy = env.store.publishLegalDocument('privacy_notice', 'v1');
      const terms = env.store.publishLegalDocument('terms_and_conditions', 'v1');

      const error = await policy.assertCanBookAppointments(actor).catch((e) => e);
      expect(error).toBeInstanceOf(RegistrationIncompleteError);
      expect(error.details).toEqual({ missing: ['legal', 'identity_submission'] });

      await new AcceptLegalDocumentsUseCase(env.uow, env.audit, env.store).execute(actor, [privacy.id, terms.id]);
      const { submissionId } = await env.submit.execute(actor, { front: syntheticJpeg(), back: syntheticJpeg() });
      await env.review.execute(await admin(env), submissionId, { decision: 'approve' });
      await expect(policy.assertCanBookAppointments(actor)).resolves.toBeUndefined();
    });
  });
});
