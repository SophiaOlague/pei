import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';
import { ConcurrencyConflictError } from '../../src/common/domain/persistence.errors';
import { computeRegistrationStatus } from '../../src/modules/identity/domain/registration-status';
import {
  AdminAlreadyExistsError,
  DuplicateCurpError,
  IdentityAlreadyApprovedError,
  IdentityDocumentUnavailableError,
  IdentityVerificationAlreadyReviewedError,
  IdentityVerificationPendingError,
  LegalDocumentNotCurrentError,
} from '../../src/modules/identity/domain/identity.errors';
import { captureError, deferred, RollbackSignal, withRollback, type Tx } from '../support/with-rollback';
import { countM00Residue, countM02Residue } from '../support/residue';
import { syntheticCurp, syntheticJpeg, syntheticPng } from '../support/synthetic-identity';
import {
  auditRows,
  createAdminActor,
  createPatient,
  identityUseCases,
  insertAuthUser,
  publishLegalDocument,
  sessionActor,
} from '../support/identity-integration';

// M02 Identity contra la BD de PEI con los adaptadores reales de PostgreSQL. Todo se revierte:
// withRollback para una conexión y, en concurrencia, dos transacciones que terminan en ROLLBACK.
// R2 y Better Auth se reemplazan por dobles; no se usan INEs reales ni CURP reales.
// Requiere 0004_m02_identity y 0005_m02_identity_guards aplicadas.

// Abre la transacción A, ejecuta "work" y la mantiene abierta hasta release(); luego la revierte.
function holdOpenTransaction(work: (tx: Tx) => Promise<unknown>) {
  const done = deferred();
  const release = deferred();
  const outcome = captureError(
    db.transaction(async (tx) => {
      await transactionStorage.run(tx as any, () => work(tx));
      done.resolve();
      await release.promise;
      throw new RollbackSignal();
    }),
  );
  const ready = Promise.race([
    done.promise,
    outcome.then((error) => {
      throw error ?? new Error('La transacción A terminó antes de tiempo');
    }),
  ]);
  return { ready, release: () => release.resolve(), outcome };
}

// Transacción B con lock_timeout: si queda bloqueada por A, falla con 55P03 (ConcurrencyConflictError).
async function inTimedTransaction<T>(work: () => Promise<T>): Promise<unknown> {
  return captureError(
    db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '2s'`);
      await transactionStorage.run(tx as any, work);
      throw new RollbackSignal();
    }),
  ).then((error) => (error instanceof RollbackSignal ? null : error));
}

describe('Identity M02 con PostgreSQL (BD de desarrollo, siempre con rollback)', () => {
  let m00Before: Record<string, number>;
  let m02Before: Record<string, number>;

  beforeAll(async () => {
    m00Before = await countM00Residue();
    m02Before = await countM02Residue();
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(m00Before);
    expect(await countM02Residue()).toEqual(m02Before);
    await db.$client.end();
  });

  describe('perfil del paciente', () => {
    it('[TC-M02-100][RF-01][RNF-08] crea user_profile (patient) y patient_profile con el evento created en la misma UoW', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const patient = await createPatient(useCases);

        const { rows } = await db.execute(sql`select 1`); // la conexión global sigue disponible
        expect(rows).toHaveLength(1);
        const [profileRow] = (
          await transactionStorage.getStore()!.execute<{ role: string; curp: string }>(sql`
            select up.role, pp.curp from patient_profile pp join user_profile up on up.id = pp.user_profile_id
             where pp.id = ${patient.patientProfileId}`)
        ).rows;
        expect(profileRow.role).toBe('patient');
        expect(profileRow.curp).toMatch(/^X[AEIOUX]XX/);
        expect(await auditRows(patient.patientProfileId)).toEqual([
          { action: 'identity.patient_profile.created', actor_type: 'user', actor_user_profile_id: patient.userProfileId, metadata: null },
        ]);
      }));

    it('[TC-M02-101][DT-22] CURP duplicada → DuplicateCurpError (409) genérico y sin escribir', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const curp = syntheticCurp();
        await createPatient(useCases, curp);
        const other = sessionActor(await insertAuthUser());

        const error = (await captureError(
          useCases.register.execute(other, { firstName: 'Otra', lastName: 'Cuenta', curp, birthDate: '1991-02-02' }),
        )) as Error;
        expect(error).toBeInstanceOf(DuplicateCurpError);
        expect(error.message).not.toContain(curp);
        expect(await useCases.userProfiles.findByUserId(other.userId)).toBeNull();
      }));

    it('[TC-M02-102][DT-22] carrera de dos conexiones con la misma CURP: B queda bloqueada por A y falla con 409, sin escribir', async () => {
      const curp = syntheticCurp();
      const a = holdOpenTransaction(() => createPatient(identityUseCases(), curp));
      try {
        await a.ready;
        const useCases = identityUseCases();
        const error = await inTimedTransaction(async () => {
          const actor = sessionActor(await insertAuthUser());
          await useCases.register.execute(actor, { firstName: 'B', lastName: 'Carrera', curp, birthDate: '1992-03-03' });
        });
        expect(error).toBeInstanceOf(ConcurrencyConflictError);
        expect((error as ConcurrencyConflictError).kind).toBe('conflict');
      } finally {
        a.release();
        expect(await a.outcome).toBeInstanceOf(RollbackSignal);
      }
    });
  });

  describe('aceptación legal', () => {
    it('[TC-M02-103][RF-03][RF-04][RNF-12] acepta la versión vigente con IP y user-agent; una versión nueva deja legal.accepted en falso', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const patient = await createPatient(useCases);
        const privacy = await publishLegalDocument('privacy_notice', sql`now() - interval '1 second'`);
        const terms = await publishLegalDocument('terms_and_conditions');

        await useCases.acceptLegal.execute(patient, [privacy, terms]);
        await useCases.acceptLegal.execute(patient, [privacy]); // idempotente
        const { rows } = await transactionStorage.getStore()!.execute<{ ip_address: string; user_agent: string }>(
          sql`select ip_address, user_agent from user_legal_acceptance where user_profile_id = ${patient.userProfileId}`,
        );
        expect(rows).toEqual([
          { ip_address: '203.0.113.7', user_agent: 'PEI-M02-int' },
          { ip_address: '203.0.113.7', user_agent: 'PEI-M02-int' },
        ]);
        expect(computeRegistrationStatus(await useCases.reader.read(patient.userId)).legal.accepted).toBe(true);

        // Nueva versión del aviso de privacidad: la anterior deja de ser vigente.
        // La aceptada se publicó 1 s antes; la nueva, con now(), pasa a ser la vigente.
        const newPrivacy = await publishLegalDocument('privacy_notice', sql`now()`);
        const status = computeRegistrationStatus(await useCases.reader.read(patient.userId));
        expect(status.legal.accepted).toBe(false);
        expect(status.legal.pending.map((d) => d.documentId)).toEqual([newPrivacy]);
      }));

    it('[TC-M02-104][RN-006] una versión obsoleta → LegalDocumentNotCurrentError (409) sin guardar nada', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const patient = await createPatient(useCases);
        const old = await publishLegalDocument('privacy_notice', sql`now() - interval '2 seconds'`);
        await publishLegalDocument('privacy_notice', sql`now() - interval '1 second'`);
        const terms = await publishLegalDocument('terms_and_conditions');

        expect(await captureError(useCases.acceptLegal.execute(patient, [old, terms]))).toBeInstanceOf(LegalDocumentNotCurrentError);
        const { rows } = await transactionStorage.getStore()!.execute(
          sql`select 1 from user_legal_acceptance where user_profile_id = ${patient.userProfileId}`,
        );
        expect(rows).toHaveLength(0);
      }));
  });

  describe('envíos del INE', () => {
    it('[TC-M02-105][DP-11][DT-2][DT-16] primer envío; segundo con pending → 409; tras rejected → attempt 2; tras approved → 409', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const patient = await createPatient(useCases);
        const reviewer = await createAdminActor(useCases);
        const files = { front: syntheticJpeg(), back: syntheticPng() };

        const first = await useCases.submit.execute(patient, files);
        expect(first).toMatchObject({ status: 'pending', attempt: 1 });
        expect(await captureError(useCases.submit.execute(patient, files))).toBeInstanceOf(IdentityVerificationPendingError);

        await useCases.review.execute(reviewer, first.submissionId, { decision: 'reject', reason: 'La foto está borrosa' });
        const second = await useCases.submit.execute(patient, files);
        expect(second.attempt).toBe(2);
        expect(await auditRows(second.submissionId)).toEqual([
          expect.objectContaining({ action: 'identity.identity_verification.submitted', metadata: { attempt: 2 } }),
        ]);

        await useCases.review.execute(reviewer, second.submissionId, { decision: 'approve' });
        expect(await captureError(useCases.submit.execute(patient, files))).toBeInstanceOf(IdentityAlreadyApprovedError);
      }));

    it('[TC-M02-106][DP-11][DT-6] carrera de envíos: el índice parcial rechaza el segundo pending (409) y se compensan sus objetos', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const patient = await createPatient(useCases);
        await useCases.submit.execute(patient, { front: syntheticJpeg(), back: syntheticJpeg() });
        const objectsBefore = useCases.storage.objects.size;

        // Simula la carrera: ninguna de las dos comprobaciones del caso de uso ve el envío pendiente.
        jest.spyOn(useCases.verifications, 'findLatestForPatient').mockResolvedValue(null);
        const error = await captureError(useCases.submit.execute(patient, { front: syntheticJpeg(), back: syntheticJpeg() }));
        jest.restoreAllMocks();

        expect(error).toBeInstanceOf(IdentityVerificationPendingError);
        expect(useCases.storage.objects.size).toBe(objectsBefore);
        expect(useCases.storage.deleted).toHaveLength(2);
      }));

    it('[TC-M02-107][DT-6] si la BD falla después de subir, se eliminan los objetos subidos (compensación)', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const patient = await createPatient(useCases);
        jest.spyOn(useCases.verifications, 'create').mockRejectedValueOnce(new Error('fallo simulado de la BD'));

        expect(await captureError(useCases.submit.execute(patient, { front: syntheticJpeg(), back: syntheticPng() }))).toMatchObject({
          message: 'fallo simulado de la BD',
        });
        jest.restoreAllMocks();
        expect(useCases.storage.objects.size).toBe(0);
        expect(useCases.storage.deleted).toHaveLength(2);
        expect(await useCases.verifications.findLatestForPatient(patient.patientProfileId)).toBeNull();
      }));
  });

  describe('revisión, acceso y purga', () => {
    async function pending() {
      const useCases = identityUseCases();
      const patient = await createPatient(useCases);
      const reviewer = await createAdminActor(useCases);
      const { submissionId } = await useCases.submit.execute(patient, { front: syntheticJpeg(), back: syntheticPng() });
      return { useCases, patient, reviewer, submissionId };
    }

    it('[TC-M02-108][DP-15][RNF-08] ver un documento pendiente registra identity_document.viewed por lado en la UoW', () =>
      withRollback(async () => {
        const { useCases, reviewer, submissionId } = await pending();
        await useCases.open.execute(reviewer, submissionId, 'front');
        await useCases.open.execute(reviewer, submissionId, 'back');

        const viewed = (await auditRows(submissionId)).filter((r) => r.action === 'identity.identity_document.viewed');
        expect(viewed.map((r) => r.metadata)).toEqual(expect.arrayContaining([{ side: 'front' }, { side: 'back' }]));
        expect(viewed.every((r) => r.actor_user_profile_id === reviewer.userProfileId)).toBe(true);
      }));

    it.each(['approve', 'reject'] as const)('[TC-M02-109][DT-5] purga tras %s: elimina los 2 objetos, claves en NULL y documents_deleted_at fijado; acceso → 409', (decision) =>
      withRollback(async () => {
        const { useCases, reviewer, submissionId } = await pending();
        const result = await useCases.review.execute(
          reviewer,
          submissionId,
          decision === 'approve' ? { decision } : { decision, reason: 'Los datos no coinciden' },
        );

        expect(result.documentsDeleted).toBe(true);
        expect(useCases.storage.objects.size).toBe(0);
        const row = await useCases.verifications.findById(submissionId);
        expect(row).toMatchObject({ frontObjectKey: null, backObjectKey: null, documentsDeletedAt: expect.any(Date) });
        expect((await auditRows(submissionId)).map((r) => r.action)).toContain(
          decision === 'approve' ? 'identity.identity_verification.approved' : 'identity.identity_verification.rejected',
        );
        expect(await captureError(useCases.open.execute(reviewer, submissionId, 'front'))).toBeInstanceOf(IdentityDocumentUnavailableError);
      }));

    it('[TC-M02-110][DT-5][DT-6] si la eliminación falla, el envío queda revisado con claves; el CLI de purga lo completa', () =>
      withRollback(async () => {
        const { useCases, reviewer, submissionId } = await pending();
        useCases.storage.failDelete = true;
        const result = await useCases.review.execute(reviewer, submissionId, { decision: 'approve' });

        expect(result).toMatchObject({ status: 'approved', documentsDeleted: false });
        expect(await useCases.verifications.findById(submissionId)).toMatchObject({ status: 'approved', documentsDeletedAt: null });

        useCases.storage.failDelete = false;
        const purge = await useCases.purge.execute();
        expect(purge.failed).toBe(0);
        expect(purge.purged).toBeGreaterThanOrEqual(1);
        expect(await useCases.verifications.findById(submissionId)).toMatchObject({ frontObjectKey: null, documentsDeletedAt: expect.any(Date) });
      }));

    it('[TC-M02-111][RF-07] revisión concurrente: si otro administrador ya resolvió el envío, la segunda revisión → 409', () =>
      withRollback(async () => {
        const { useCases, reviewer, submissionId } = await pending();
        const stale = await useCases.verifications.findById(submissionId);
        await useCases.review.execute(reviewer, submissionId, { decision: 'approve' });

        // La segunda revisión leyó el envío cuando aún estaba pendiente: el UPDATE ... WHERE status='pending' no cambia nada.
        jest.spyOn(useCases.verifications, 'findById').mockResolvedValueOnce(stale);
        const error = await captureError(useCases.review.execute(reviewer, submissionId, { decision: 'reject', reason: 'Motivo de la segunda revisión' }));
        jest.restoreAllMocks();

        expect(error).toBeInstanceOf(IdentityVerificationAlreadyReviewedError);
        expect(await useCases.verifications.findById(submissionId)).toMatchObject({ status: 'approved', rejectionReason: null });
      }));
  });

  describe('bootstrap del primer administrador (DT-12)', () => {
    it('[TC-M02-112][DP-5][DT-12] primera ejecución crea el admin con evento de sistema; la segunda aborta', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const adminAlreadyExists = await useCases.userProfiles.adminExists();
        const input = { email: `admin-${Date.now()}@m00.test.invalid`, firstName: 'Admin', lastName: 'Bootstrap' };

        if (adminAlreadyExists) {
          // Falla cerrado si la BD de desarrollo ya tiene un administrador.
          expect(await captureError(useCases.bootstrap.execute(input))).toBeInstanceOf(AdminAlreadyExistsError);
          return;
        }
        const result = await useCases.bootstrap.execute(input);
        expect(await auditRows(result.userProfileId)).toEqual([
          { action: 'identity.admin.bootstrapped', actor_type: 'system', actor_user_profile_id: null, metadata: { systemProcess: 'cli.admin-bootstrap' } },
        ]);
        expect(useCases.provisioner.passwordSetups).toEqual([input.email]);
        expect(await captureError(useCases.bootstrap.execute({ ...input, email: `otro-${Date.now()}@m00.test.invalid` }))).toBeInstanceOf(
          AdminAlreadyExistsError,
        );
      }));

    it('[TC-M02-113][DT-12] dos bootstraps concurrentes se serializan con el bloqueo consultivo: B no avanza mientras A lo tiene', async () => {
      const a = holdOpenTransaction(async () => {
        const useCases = identityUseCases();
        if (await useCases.userProfiles.adminExists()) return;
        await useCases.bootstrap.execute({ email: `admin-a-${Date.now()}@m00.test.invalid`, firstName: 'A', lastName: 'Concurrente' });
      });
      try {
        await a.ready;
        // B pasa la comprobación previa (no ve el admin sin confirmar de A) y queda bloqueada en el bloqueo consultivo.
        const useCases = identityUseCases();
        const error = await inTimedTransaction(() =>
          useCases.bootstrap.execute({ email: `admin-b-${Date.now()}@m00.test.invalid`, firstName: 'B', lastName: 'Concurrente' }),
        );
        expect(error).toBeInstanceOf(ConcurrencyConflictError);
      } finally {
        a.release();
        expect(await a.outcome).toBeInstanceOf(RollbackSignal);
      }
    });
  });

  describe('restricciones de la BD (0004 y 0005)', () => {
    const expectViolation = async (statement: ReturnType<typeof sql>, code: string, constraint?: string) => {
      const error = (await captureError(
        db.transaction(async (tx) => {
          await tx.execute(statement);
          throw new RollbackSignal();
        }),
      )) as { cause?: { code?: string; constraint?: string } };
      expect(error).not.toBeInstanceOf(RollbackSignal);
      expect(error?.cause?.code).toBe(code);
      if (constraint) expect(error?.cause?.constraint).toBe(constraint);
    };

    it('[TC-M02-114][RN-001][DP-5] el rol de un user_profile no se puede cambiar (P0001)', () =>
      withRollback(async (tx) => {
        const useCases = identityUseCases();
        const patient = await createPatient(useCases);
        const error = (await captureError(
          tx.transaction((t) => t.execute(sql`update user_profile set role = 'admin' where id = ${patient.userProfileId}`)),
        )) as {
          cause?: { code?: string; message?: string };
        };
        expect(error?.cause?.code).toBe('P0001');
        expect(error?.cause?.message).toBe('El rol de un perfil de usuario no se puede cambiar');
      }));

    it.each(['legal_document', 'user_legal_acceptance'])('[TC-M02-115][RN-006][RNF-12] TRUNCATE %s → P0001', async (table) => {
      // Protección: sin el trigger de 0005 no se ejecuta ningún TRUNCATE (la prueba falla sin tocar datos).
      const { rows } = await db.execute<{ n: string }>(
        sql`select count(*) as n from pg_trigger where tgname = ${`${table}_no_truncate`} and not tgisinternal`,
      );
      expect(Number(rows[0].n)).toBe(1);
      await expectViolation(sql.raw(`truncate ${table} cascade`), 'P0001');
    });

    it('[TC-M02-116][DT-22] CHECK de la CURP: minúsculas y formato inválido → 23514', async () => {
      const insert = (curp: string) => sql`
        with u as (insert into "user" (id, name, email) values (gen_random_uuid()::text, 'x', gen_random_uuid()::text || '@m00.test.invalid') returning id),
             p as (insert into user_profile (user_id, role, first_name, last_name) select id, 'patient', 'x', 'y' from u returning id)
        insert into patient_profile (user_profile_id, curp) select id, ${curp} from p`;
      await expectViolation(insert(syntheticCurp().toLowerCase()), '23514');
      await expectViolation(insert('XBXX010101HNEXXXA4'), '23514', 'patient_profile_curp_format_chk');
    });

    it('[TC-M02-117][DT-2][DT-5] CHECK de claves por estado y unicidades (patient_id, attempt) y (type, published_at)', () =>
      withRollback(async () => {
        const useCases = identityUseCases();
        const patient = await createPatient(useCases);
        const reviewer = await createAdminActor(useCases);
        const { submissionId } = await useCases.submit.execute(patient, { front: syntheticJpeg(), back: syntheticJpeg() });
        await useCases.review.execute(reviewer, submissionId, { decision: 'reject', reason: 'Prueba de restricciones' });
        const pid = patient.patientProfileId;

        // Cada sentencia va en un SAVEPOINT: su error no invalida la transacción de la prueba.
        const inTx = (statement: ReturnType<typeof sql>) => captureError(transactionStorage.getStore()!.transaction((t) => t.execute(statement)));
        const codeOf = (e: unknown) => (e as { cause?: { code?: string; constraint?: string } })?.cause;

        expect(codeOf(await inTx(sql`insert into patient_identity_verification (patient_id, attempt, status) values (${pid}, 3, 'pending')`))).toMatchObject({
          code: '23514',
          constraint: 'patient_identity_verification_pending_keys_chk',
        });
        expect(
          codeOf(
            await inTx(sql`insert into patient_identity_verification (patient_id, attempt, status, ine_front_object_key, ine_back_object_key, documents_deleted_at)
                           values (${pid}, 3, 'rejected', 'a', 'b', now())`),
          ),
        ).toMatchObject({ code: '23514', constraint: 'patient_identity_verification_deleted_keys_chk' });
        expect(
          codeOf(
            await inTx(sql`insert into patient_identity_verification (patient_id, attempt, status, ine_front_object_key, ine_back_object_key)
                           values (${pid}, 1, 'rejected', 'a', 'b')`),
          ),
        ).toMatchObject({ code: '23505', constraint: 'patient_identity_verification_patient_attempt_uq' });
        expect(
          codeOf(
            await inTx(sql`insert into patient_identity_verification (patient_id, attempt, status, ine_front_object_key, ine_back_object_key)
                           values (${pid}, 5, 'pending', 'a', 'b'), (${pid}, 6, 'pending', 'c', 'd')`),
          ),
        ).toMatchObject({ code: '23505', constraint: 'patient_identity_verification_one_pending_uq' });

        await publishLegalDocument('terms_and_conditions');
        expect(codeOf(await captureError(transactionStorage.getStore()!.transaction(() => publishLegalDocument('terms_and_conditions'))))).toMatchObject({
          code: '23505',
          constraint: 'legal_document_type_published_at_uq',
        });
      }));
  });
});
