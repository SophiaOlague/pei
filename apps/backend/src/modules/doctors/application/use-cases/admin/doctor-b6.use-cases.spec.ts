import { randomUUID } from 'crypto';
import type { Actor } from '../../../../../common/application/actor';
import { FakeDocumentStorage } from '../../../../../../test/support/identity-in-memory';
import { InMemoryDoctorAuditTrail, InMemoryDoctorUnitOfWork, InMemoryDoctorWorld } from '../../../../../../test/support/doctors-world';
import { syntheticCurp } from '../../../../../../test/support/synthetic-identity';
import { DoctorStatusService } from '../../doctor-status.service';
import { DoctorIdentityDocumentPurger } from '../doctor-identity-document-purger';
import { RegisterDoctorProfileUseCase } from '../register-doctor-profile.use-case';
import { ChangeDoctorIdentityUseCase } from '../doctor-changes.use-cases';
import { SubmitDoctorIdentityVerificationUseCase, SubmitDoctorLicenseVerificationUseCase } from '../doctor-submissions.use-cases';
import {
  GetDoctorReviewDetailUseCase, ListPendingDoctorReviewsUseCase, OpenDoctorReviewDocumentUseCase, PurgeTerminalDoctorIdentityDocumentsUseCase,
  ReviewDoctorVerificationUseCase,
} from './doctor-review.use-cases';
import { GetDoctorDetailUseCase, ListDoctorsUseCase } from './doctor-admin.use-cases';
import {
  AdminRequiredError, DoctorIdentityDocumentUnavailableError, DoctorNotFoundError, DoctorReviewNotFoundError, InvalidRejectionReasonError,
  ReviewNotCurrentError, ReviewNotPendingError,
} from '../../../domain/doctor.errors';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.7 sintetico');
const REASON = 'Documento ilegible, envía otra foto';

function setup() {
  const world = new InMemoryDoctorWorld();
  const uow = new InMemoryDoctorUnitOfWork(world);
  const audit = new InMemoryDoctorAuditTrail(world);
  const storage = new FakeDocumentStorage();
  const status = new DoctorStatusService(world, world);
  const purger = new DoctorIdentityDocumentPurger(storage, world);
  return {
    world, uow, storage, status,
    register: new RegisterDoctorProfileUseCase(uow, audit, world, world, world.catalog),
    changeIdentity: new ChangeDoctorIdentityUseCase(uow, audit, world, world, world, status, purger),
    submitIne: new SubmitDoctorIdentityVerificationUseCase(uow, audit, storage, world, world, status, purger),
    submitLicense: new SubmitDoctorLicenseVerificationUseCase(uow, audit, storage, world, world, status),
    queue: new ListPendingDoctorReviewsUseCase(world),
    detail: new GetDoctorReviewDetailUseCase(world, world, world, world.catalog),
    review: new ReviewDoctorVerificationUseCase(uow, audit, world, world, status, purger),
    documents: new OpenDoctorReviewDocumentUseCase(uow, audit, storage, world, world),
    purgeCli: new PurgeTerminalDoctorIdentityDocumentsUseCase(world, purger),
    list: new ListDoctorsUseCase(world, world, world.catalog, status),
    doctorDetail: new GetDoctorDetailUseCase(world, world, world.catalog, status),
  };
}
type Env = ReturnType<typeof setup>;

async function adminActor(env: Env): Promise<Actor> {
  const userId = `admin-${randomUUID()}`;
  const userProfileId = await env.world.store.createAdmin({ userId, firstName: 'Admin', lastName: 'Sintético' });
  return { userId, userProfileId, role: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' };
}

// Médico con INE y cédula pendientes.
async function submittedDoctor(env: Env) {
  const base: Actor = { userId: `medico-${randomUUID()}`, userProfileId: null, role: null, ipAddress: null, userAgent: null };
  const { doctorProfileId, userProfileId } = await env.register.execute(base, { firstName: 'Ana', lastName: 'Pérez', curp: syntheticCurp(), specialtyId: env.world.catalog.byCode('medicina_general').id });
  env.world.acceptDoctorRegime(userProfileId);
  const actor: Actor = { ...base, userProfileId, role: 'doctor' };
  const ine = await env.submitIne.execute(actor, { front: JPEG, back: JPEG });
  const lic = await env.submitLicense.execute(actor, { licenseNumber: `L${randomUUID().slice(0, 6)}`, document: PDF });
  return { actor, doctorProfileId, userProfileId, ineId: ine.reviewId, licId: lic.reviewId };
}
const actions = (env: Env, from = 0) => env.world.audit.slice(from).map((e) => e.action);

describe('Revisión del admin (M03 B6: RF-06, D-25, D-27, R-2, E.5)', () => {
  it('[TC-M03-154][D-27][RF-06] aprobar INE y cédula vigentes deja al médico approved; la INE se purga y la cédula se conserva', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const d = await submittedDoctor(env);
    const start = env.world.audit.length;
    const ine = await env.review.execute(admin, 'identity', d.ineId, { decision: 'approve' });
    expect(ine).toMatchObject({ status: 'approved', documentsDeleted: true, doctorStatus: { status: 'pending', identity: 'approved' } });
    const lic = await env.review.execute(admin, 'license', d.licId, { decision: 'approve' });
    expect(lic).toMatchObject({ status: 'approved', documentsDeleted: null, doctorStatus: { status: 'approved' } });
    expect(env.world.doctor.identity[0]).toMatchObject({ frontObjectKey: null, backObjectKey: null, reviewedBy: admin.userProfileId });
    expect(env.storage.objects.has(env.world.doctor.license[0].documentObjectKey)).toBe(true);
    expect(actions(env, start)).toEqual(['doctor.identity_verification.approved', 'doctor.license_verification.approved']);
  });

  it('[TC-M03-155][D-25] rechazo: motivo obligatorio (400 sin transacción); con motivo → rejected y el médico lo ve', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const d = await submittedDoctor(env);
    const calls = env.uow.calls;
    await expect(env.review.execute(admin, 'identity', d.ineId, { decision: 'reject', reason: 'corto' })).rejects.toThrow(InvalidRejectionReasonError);
    expect(env.uow.calls).toBe(calls);
    await env.review.execute(admin, 'license', d.licId, { decision: 'approve' });
    const r = await env.review.execute(admin, 'identity', d.ineId, { decision: 'reject', reason: REASON });
    expect(r.doctorStatus).toMatchObject({ status: 'rejected', identity: 'rejected' });
    expect(env.world.doctor.identity[0]).toMatchObject({ status: 'rejected', rejectionReason: REASON, frontObjectKey: null });
    // D.4: el reenvío vuelve a pending y una nueva aprobación lo deja approved.
    const again = await env.submitIne.execute(d.actor, { front: JPEG, back: JPEG });
    expect(again.status.status).toBe('pending');
    expect((await env.review.execute(admin, 'identity', again.reviewId, { decision: 'approve' })).doctorStatus.status).toBe('approved');
  });

  it('[TC-M03-156][R-2] una revisión terminal o superseded no se revisa (409); un id inexistente → 404', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const d = await submittedDoctor(env);
    await env.review.execute(admin, 'identity', d.ineId, { decision: 'approve' });
    await expect(env.review.execute(admin, 'identity', d.ineId, { decision: 'reject', reason: REASON })).rejects.toThrow(ReviewNotPendingError);
    const second = await env.submitIne.execute(d.actor, { front: JPEG, back: JPEG });
    await env.submitIne.execute(d.actor, { front: JPEG, back: JPEG });
    await expect(env.review.execute(admin, 'identity', second.reviewId, { decision: 'approve' })).rejects.toThrow(ReviewNotPendingError);
    await expect(env.review.execute(admin, 'license', randomUUID(), { decision: 'approve' })).rejects.toThrow(DoctorReviewNotFoundError);
  });

  it('[TC-M03-157][E.5] una revisión pendiente de una versión anterior no se aprueba (409) y nada cambia', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const d = await submittedDoctor(env);
    env.world.profileRow(d.doctorProfileId).professionalRevision += 1; // la versión vigente avanzó (carrera E.5)
    await expect(env.review.execute(admin, 'license', d.licId, { decision: 'approve' })).rejects.toThrow(ReviewNotCurrentError);
    expect(env.world.doctor.license[0].status).toBe('pending');
  });

  it('[TC-M03-158][Admin] solo admin revisa, consulta colas o abre documentos (falla cerrado)', async () => {
    const env = setup();
    const d = await submittedDoctor(env);
    for (const actor of [d.actor, { ...d.actor, role: 'admin' as const, userProfileId: null }]) {
      await expect(env.review.execute(actor, 'identity', d.ineId, { decision: 'approve' })).rejects.toThrow(AdminRequiredError);
      await expect(env.queue.execute(actor, 'identity', 1, 20)).rejects.toThrow(AdminRequiredError);
      await expect(env.documents.identity(actor, d.ineId, 'front')).rejects.toThrow(AdminRequiredError);
      await expect(env.list.execute(actor, { page: 1, pageSize: 20 })).rejects.toThrow(AdminRequiredError);
    }
  });
});

describe('Documentos, colas y detalle para el admin (M03 B6: D-16, D-19, D-22)', () => {
  it('[TC-M03-159][D-19][RNF-08] la INE pendiente y vigente se abre con un evento por lado; terminada → 409', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const d = await submittedDoctor(env);
    const start = env.world.audit.length;
    const front = await env.documents.identity(admin, d.ineId, 'front');
    await env.documents.identity(admin, d.ineId, 'back');
    expect(front.contentType).toBe('image/jpeg');
    expect(env.world.audit.slice(start).map((e) => [e.action, e.metadata])).toEqual([
      ['doctor.identity_document.viewed', { side: 'front' }],
      ['doctor.identity_document.viewed', { side: 'back' }],
    ]);
    await env.review.execute(admin, 'identity', d.ineId, { decision: 'approve' });
    await expect(env.documents.identity(admin, d.ineId, 'front')).rejects.toThrow(DoctorIdentityDocumentUnavailableError);
  });

  it('[TC-M03-160][D-16][D-22] la cédula se abre en cualquier estado y cada lectura se audita', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const d = await submittedDoctor(env);
    await env.review.execute(admin, 'license', d.licId, { decision: 'reject', reason: REASON });
    const start = env.world.audit.length;
    expect((await env.documents.license(admin, d.licId)).contentType).toBe('application/pdf');
    expect(actions(env, start)).toEqual(['doctor.license_document.viewed']);
  });

  it('[TC-M03-161][RF-06] colas en orden de llegada y paginadas; el detalle muestra los datos legales vigentes', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const a = await submittedDoctor(env);
    const b = await submittedDoctor(env);
    const q = await env.queue.execute(admin, 'license', 1, 1);
    expect(q).toMatchObject({ total: 2, items: [{ id: a.licId, reason: 'initial', status: 'pending' }] });
    expect((await env.queue.execute(admin, 'license', 2, 1)).items[0].id).toBe(b.licId);
    expect(JSON.stringify(q)).not.toMatch(/doctor-licenses\//);

    await env.changeIdentity.execute(a.actor, { lastName: 'Pérez López' });
    const lic = await env.detail.licenseDetail(admin, env.world.doctor.license.find((r) => r.doctorId === a.doctorProfileId && r.status === 'pending')!.id);
    expect(lic).toMatchObject({ reason: 'legal_name_changed', isCurrent: true, doctor: { lastName: 'Pérez López' }, specialty: { code: 'medicina_general' } });
    const ine = await env.detail.identityDetail(admin, b.ineId);
    expect(ine).toMatchObject({ isCurrent: true, documentsAvailable: true, doctor: { firstName: 'Ana' } });
    expect(ine.doctor.curp).toMatch(/^[A-Z]{4}/);
  });

  it('[TC-M03-162][R-7][D-36] la lista del admin filtra por el estado derivado; el detalle trae el historial sin claves; id ajeno → 404', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const a = await submittedDoctor(env);
    await submittedDoctor(env);
    await env.review.execute(admin, 'identity', a.ineId, { decision: 'approve' });
    await env.review.execute(admin, 'license', a.licId, { decision: 'approve' });
    expect((await env.list.execute(admin, { status: 'approved', page: 1, pageSize: 20 })).items.map((i) => i.doctorProfileId)).toEqual([a.doctorProfileId]);
    expect((await env.list.execute(admin, { status: 'pending', page: 1, pageSize: 20 })).total).toBe(1);
    const detail = await env.doctorDetail.execute(admin, a.doctorProfileId);
    expect(detail).toMatchObject({ status: 'approved', history: { identity: [{ status: 'approved' }], license: [{ status: 'approved', reason: 'initial' }] } });
    expect(JSON.stringify(detail)).not.toMatch(/doctor-(identity|licenses)\//);
    await expect(env.doctorDetail.execute(admin, randomUUID())).rejects.toThrow(DoctorNotFoundError);
  });

  it('[TC-M03-163][D-19][DT-6] si la purga posterior falla, la CLI de conciliación la completa después', async () => {
    const env = setup();
    const admin = await adminActor(env);
    const d = await submittedDoctor(env);
    env.storage.failDelete = true;
    expect((await env.review.execute(admin, 'identity', d.ineId, { decision: 'approve' })).documentsDeleted).toBe(false);
    expect(env.world.doctor.identity[0].frontObjectKey).not.toBeNull();
    env.storage.failDelete = false;
    expect(await env.purgeCli.execute()).toEqual({ found: 1, purged: 1, failed: 0 });
    expect(await env.purgeCli.execute()).toEqual({ found: 0, purged: 0, failed: 0 });
  });
});
