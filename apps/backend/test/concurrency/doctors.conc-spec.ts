import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';
import type { Actor } from '../../src/common/application/actor';
import { DrizzleUserProfileRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-user-profile.repository';
import { ReviewNotPendingError } from '../../src/modules/doctors/domain/doctor.errors';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { captureError, deferred, type Tx } from '../support/with-rollback';
import { insertAuthUser, sessionActor } from '../support/identity-integration';
import { acceptDoctorRegime, doctorUseCases, JPEG, PDF, specialtyId } from '../support/doctors-integration';
import { syntheticCurp } from '../support/synthetic-identity';

// M03 B8 (plan v2 §9 y §13; diseño v3 §E.5): concurrencia con DOS conexiones y datos CONFIRMADOS. La conexión B
// necesita ver al médico que crea la preparación, y las tablas de revisión bloquean DELETE y TRUNCATE (0012): estos
// datos NO se pueden limpiar. Por eso este spec solo se ejecuta contra una rama de Neon DESECHABLE (X-6), nunca contra
// `rama` ni `production`, y fuera de la suite de integración (config propia: test/jest-concurrency.json).
assertC2BranchTarget();
const RAMA = 'br-autumn-sun-b52qoep4';
// Excepción (2026-10-20): el usuario aceptó por escrito ejecutarlo en `rama` con datos permanentes; C2 v11.1 lo marca
// con un valor propio que solo inyecta para `rama`.
const allowed = process.env.C2_EXPECTED_BRANCH === RAMA
  ? process.env.C2_COMMITTED_FIXTURES === 'rama-permanent-accepted'
  : process.env.C2_COMMITTED_FIXTURES === 'disposable-branch';
if (!allowed) {
  throw new Error('doctors.conc-spec confirma datos: solo contra una rama desechable autorizada (C2_COMMITTED_FIXTURES=disposable-branch)');
}

const uc = doctorUseCases();
const REASON = 'Documento ilegible, envía otra imagen';

// Ejecuta `work` en una transacción que se mantiene abierta hasta release() y después se CONFIRMA.
function holdThenCommit(work: () => Promise<unknown>) {
  const done = deferred();
  const release = deferred();
  const outcome = captureError(
    db.transaction(async (tx: Tx) => {
      await transactionStorage.run(tx as any, work);
      done.resolve();
      await release.promise;
    }),
  );
  const ready = Promise.race([done.promise, outcome.then((e) => { throw e ?? new Error('A terminó antes de tiempo'); })]);
  return { ready, release: () => release.resolve(), outcome };
}

async function waitForLockWait(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await db.execute<{ n: string }>(sql`select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`);
    if (Number(rows[0].n) > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Ninguna sesión quedó esperando un lock');
}

const committed = <T>(work: () => Promise<T>) => db.transaction((tx: Tx) => transactionStorage.run(tx as any, work));

async function newAdmin(): Promise<Actor> {
  return committed(async () => {
    const userId = await insertAuthUser();
    const userProfileId = await new DrizzleUserProfileRepository().createAdmin({ userId, firstName: 'Admin', lastName: 'Concurrencia' });
    return { userId, userProfileId, role: 'admin', ipAddress: null, userAgent: 'PEI-M03-conc' };
  });
}

// Médico con INE y cédula pendientes, todo confirmado.
async function submittedDoctor() {
  const userId = await committed(() => insertAuthUser());
  const base = sessionActor(userId);
  const { doctorProfileId, userProfileId } = await uc.register.execute(base, {
    firstName: 'Médica', lastName: 'Concurrencia', curp: syntheticCurp(), specialtyId: await committed(() => specialtyId('medicina_general')),
  });
  await committed(() => acceptDoctorRegime(userProfileId));
  const actor: Actor = { ...base, userProfileId, role: 'doctor' };
  const ine = await uc.submitIne.execute(actor, { front: JPEG, back: JPEG });
  const lic = await uc.submitLicense.execute(actor, { licenseNumber: `CONC${Math.floor(Math.random() * 1e9)}`, document: PDF });
  return { actor, doctorProfileId, ineId: ine.reviewId, licId: lic.reviewId };
}

describe('Concurrencia del médico (M03 B8, dos conexiones, datos confirmados)', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it('[TC-M03-183][E.5] cambio sensible primero: la aprobación espera el candado y después ve la revisión superseded (409)', async () => {
    const admin = await newAdmin();
    const d = await submittedDoctor();
    const psico = await committed(() => specialtyId('psicologia'));
    const a = holdThenCommit(() => uc.changeSpecialty.execute(d.actor, psico));
    await a.ready;
    const b = captureError(uc.review.execute(admin, 'license', d.licId, { decision: 'approve' }));
    await waitForLockWait();
    a.release();
    expect(await a.outcome).toBeNull();
    expect(await b).toBeInstanceOf(ReviewNotPendingError);
    const status = await committed(() => uc.getStatus.execute(d.actor));
    expect(status).toMatchObject({ professional: 'pending' });
  });

  it('[TC-M03-184][E.5] aprobación primero: el cambio sensible espera y abre una revisión nueva; el estado final es pending', async () => {
    const admin = await newAdmin();
    const d = await submittedDoctor();
    const psico = await committed(() => specialtyId('psicologia'));
    const a = holdThenCommit(() => uc.review.execute(admin, 'license', d.licId, { decision: 'approve' }));
    await a.ready;
    const b = captureError(uc.changeSpecialty.execute(d.actor, psico));
    await waitForLockWait();
    a.release();
    expect(await a.outcome).toBeNull();
    expect(await b).toBeNull();
    const { rows } = await db.execute<{ status: string; reason: string }>(sql`select status, reason from doctor_license_verification where doctor_id = ${d.doctorProfileId} order by attempt`);
    expect(rows).toEqual([{ status: 'approved', reason: 'initial' }, { status: 'pending', reason: 'specialty_changed' }]);
  });

  it('[TC-M03-185][R-2] dos administradores revisan lo mismo: uno gana y el otro recibe 409; un solo evento', async () => {
    const [admin1, admin2] = [await newAdmin(), await newAdmin()];
    const d = await submittedDoctor();
    const a = holdThenCommit(() => uc.review.execute(admin1, 'identity', d.ineId, { decision: 'approve' }));
    await a.ready;
    const b = captureError(uc.review.execute(admin2, 'identity', d.ineId, { decision: 'reject', reason: REASON }));
    await waitForLockWait();
    a.release();
    expect(await a.outcome).toBeNull();
    expect(await b).toBeInstanceOf(ReviewNotPendingError);
    const { rows } = await db.execute<{ n: string }>(sql`select count(*) as n from audit_log where entity_id = ${d.ineId} and action like 'doctor.identity_verification.%ed' and action <> 'doctor.identity_verification.submitted'`);
    expect(Number(rows[0].n)).toBe(1);
  });

  it('[TC-M03-186][E.1] dos envíos de INE simultáneos se serializan: intento 1 superseded e intento 2 pending', async () => {
    const d = await submittedDoctor();
    const a = holdThenCommit(() => uc.submitIne.execute(d.actor, { front: JPEG, back: JPEG }));
    await a.ready;
    const b = captureError(uc.submitIne.execute(d.actor, { front: JPEG, back: JPEG }));
    await waitForLockWait();
    a.release();
    expect([await a.outcome, await b]).toEqual([null, null]);
    const { rows } = await db.execute<{ attempt: number; status: string }>(sql`select attempt, status from doctor_identity_verification where doctor_id = ${d.doctorProfileId} order by attempt`);
    expect(rows).toEqual([{ attempt: 1, status: 'superseded' }, { attempt: 2, status: 'superseded' }, { attempt: 3, status: 'pending' }]);
  });

  it('[TC-M03-187][D-13][plan v2 §9] la política (FOR SHARE) bloquea un cambio sensible hasta que termina la operación del llamador', async () => {
    const d = await submittedDoctor();
    const psico = await committed(() => specialtyId('psicologia'));
    const a = holdThenCommit(() => uc.policy.statusOf(d.doctorProfileId));
    await a.ready;
    const b = captureError(uc.changeSpecialty.execute(d.actor, psico));
    await waitForLockWait();
    a.release();
    expect(await a.outcome).toBeNull();
    expect(await b).toBeNull();
  });
});
