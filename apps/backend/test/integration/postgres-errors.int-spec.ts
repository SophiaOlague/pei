import { randomUUID } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import type { ArgumentsHost } from '@nestjs/common';
import { db } from '../../src/db';
import {
  auditLog,
  cancellationPolicy,
  inventory,
  legalDocument,
  medicationPresentation,
  userLegalAcceptance,
} from '../../src/db/schema';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import {
  BusinessRuleViolationError,
  ExclusionConstraintViolationError,
  IntegrityConstraintViolationError,
  ReferenceViolationError,
} from '../../src/common/domain/persistence.errors';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { captureError, testTag, withRollback, type Tx } from '../support/with-rollback';
import { insertMedication, insertUserWithProfile, policyDatesBeforeExisting } from '../support/fixtures';
import { countM00Residue } from '../support/residue';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

async function insertPresentation(tx: Tx) {
  const med = await insertMedication(tx);
  const [presentation] = await tx
    .insert(medicationPresentation)
    .values({ medicationId: med.id, name: 'Caja 30 tabletas', dosageForm: 'tableta', salePrice: '100.00' })
    .returning();
  return presentation;
}

async function insertLegalDocument(tx: Tx) {
  const [doc] = await tx
    .insert(legalDocument)
    .values({ type: 'privacy_notice', version: testTag(), content: 'Aviso de prueba M00' })
    .returning();
  return doc;
}


describe('Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback)', () => {
  const unitOfWork = new DrizzleUnitOfWork();
  let residueBefore: Record<string, number>;

  beforeAll(async () => {
    residueBefore = await countM00Residue();
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(residueBefore);
    await db.$client.end();
  });

  describe('constraints del esquema', () => {
    it('[TC-M00-110][RT-M00-03] 23503 llave foránea inexistente → ReferenceViolationError', async () => {
      await withRollback(async (tx) => {
        const error = await captureError(
          unitOfWork.runInTransaction(() =>
            tx.insert(medicationPresentation).values({
              medicationId: randomUUID(),
              name: 'Huérfana',
              dosageForm: 'tableta',
              salePrice: '1.00',
            }),
          ),
        );
        expect(error).toBeInstanceOf(ReferenceViolationError);
        expect((error as ReferenceViolationError).detail.table).toBe('medication_presentation');
      });
    });

    it('[TC-M00-111][RT-M00-03][RNF-05] 23514 inventario negativo → IntegrityConstraintViolationError (inventory_quantity_on_hand_chk)', async () => {
      await withRollback(async (tx) => {
        const presentation = await insertPresentation(tx);

        const error = await captureError(
          unitOfWork.runInTransaction(() =>
            tx.insert(inventory).values({ medicationPresentationId: presentation.id, quantityOnHand: -1 }),
          ),
        );
        expect(error).toBeInstanceOf(IntegrityConstraintViolationError);
        expect((error as IntegrityConstraintViolationError).detail).toMatchObject({
          code: '23514',
          constraint: 'inventory_quantity_on_hand_chk',
        });
      });
    });

    it('[TC-M00-112][RT-M00-03] 23502 NOT NULL → IntegrityConstraintViolationError', async () => {
      await withRollback(async (tx) => {
        const error = await captureError(
          unitOfWork.runInTransaction(() => tx.execute(sql`insert into medication (name) values (null)`)),
        );
        expect(error).toBeInstanceOf(IntegrityConstraintViolationError);
        expect((error as IntegrityConstraintViolationError).detail.code).toBe('23502');
      });
    });

    it('[TC-M00-113][RT-M00-03][RNF-17] 23P01 vigencias solapadas de cancellation_policy → ExclusionConstraintViolationError', async () => {
      // Fechas que no se solapan con políticas reales de la BD de desarrollo.
      const day = await policyDatesBeforeExisting();
      await withRollback(async (tx) => {
        const { profile } = await insertUserWithProfile(tx, 'admin');
        const policy = (from: Date, until: Date) => ({
          refundDeadlineHours: 24,
          maxReschedules: 2,
          doctorWaitMinutes: 30,
          patientToleranceMinutes: 15,
          effectiveFrom: from,
          effectiveUntil: until,
          createdBy: profile.id,
        });

        // Precondición: la primera versión entra (no hay otra vigente en ese rango).
        await tx.insert(cancellationPolicy).values(policy(day(1), day(10)));

        const error = await captureError(
          unitOfWork.runInTransaction(() =>
            tx.insert(cancellationPolicy).values(policy(day(5), day(20))),
          ),
        );
        expect(error).toBeInstanceOf(ExclusionConstraintViolationError);
        expect((error as ExclusionConstraintViolationError).detail).toMatchObject({
          code: '23P01',
          constraint: 'cancellation_policy_no_overlap',
        });

        // Vigencias contiguas (fin = inicio de la siguiente) no se solapan: rango semiabierto [desde, hasta).
        await expect(
          unitOfWork.runInTransaction(() => tx.insert(cancellationPolicy).values(policy(day(10), day(20)))),
        ).resolves.toBeDefined();
      });
    });
  });

  describe('triggers reales de 0001_triggers.sql (P0001)', () => {
    it.each(['update', 'delete'] as const)(
      '[TC-M00-120][RT-M00-03][RN-119][RNF-08] audit_log es de solo inserción: %s → BusinessRuleViolationError',
      async (operation) => {
        await withRollback(async (tx) => {
          const [entry] = await tx
            .insert(auditLog)
            .values({ actorType: 'system', action: testTag() })
            .returning();

          const error = await captureError(
            unitOfWork.runInTransaction(() =>
              operation === 'update'
                ? tx.update(auditLog).set({ action: 'alterado' }).where(eq(auditLog.id, entry.id))
                : tx.delete(auditLog).where(eq(auditLog.id, entry.id)),
            ),
          );

          expect(error).toBeInstanceOf(BusinessRuleViolationError);
          expect((error as Error).message).toBe(
            `La tabla audit_log es de solo inserción: no admite ${operation.toUpperCase()}`,
          );
        });
      },
    );

    it('[TC-M00-121][RT-M00-03][RN-006][RNF-12] una versión publicada de legal_document no se modifica', async () => {
      await withRollback(async (tx) => {
        const doc = await insertLegalDocument(tx);

        const error = await captureError(
          unitOfWork.runInTransaction(() =>
            tx.update(legalDocument).set({ content: 'otro texto' }).where(eq(legalDocument.id, doc.id)),
          ),
        );
        expect(error).toBeInstanceOf(BusinessRuleViolationError);
        expect((error as Error).message).toContain('legal_document es de solo inserción');
      });
    });

    it('[TC-M00-122][RT-M00-03][RNF-12] una aceptación legal registrada no se elimina', async () => {
      await withRollback(async (tx) => {
        const { profile } = await insertUserWithProfile(tx, 'patient');
        const doc = await insertLegalDocument(tx);
        const [acceptance] = await tx
          .insert(userLegalAcceptance)
          .values({ userProfileId: profile.id, legalDocumentId: doc.id })
          .returning();

        const error = await captureError(
          unitOfWork.runInTransaction(() =>
            tx.delete(userLegalAcceptance).where(eq(userLegalAcceptance.id, acceptance.id)),
          ),
        );
        expect(error).toBeInstanceOf(BusinessRuleViolationError);
        expect((error as Error).message).toContain('user_legal_acceptance es de solo inserción');
      });
    });
  });

  describe('error real del driver que llega al filtro HTTP sin pasar por la unidad de trabajo', () => {
    it('[TC-M00-130][RT-M00-03][RNF-10] el filtro reconoce el error real de @neondatabase/serverless y responde 422 con el mensaje del trigger', async () => {
      await withRollback(async (tx) => {
        const [entry] = await tx.insert(auditLog).values({ actorType: 'system', action: testTag() }).returning();

        // Directo con tx.transaction (SAVEPOINT de Drizzle), sin la traducción de la unidad de trabajo.
        const rawError = await captureError(
          tx.transaction((sp) => sp.update(auditLog).set({ action: 'x' }).where(eq(auditLog.id, entry.id))),
        );
        expect(rawError).not.toBeInstanceOf(BusinessRuleViolationError);

        const response = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
        new DomainExceptionFilter().catch(rawError as Error, host);

        expect(response.status).toHaveBeenCalledWith(422);
        expect(response.json).toHaveBeenCalledWith({
          statusCode: 422,
          message: 'La tabla audit_log es de solo inserción: no admite UPDATE',
          error: 'BusinessRuleViolationError',
        });
      });
    });
  });
});
