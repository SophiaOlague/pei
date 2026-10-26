import { sql } from 'drizzle-orm';
import { transactionStorage } from '../../src/db/transaction-context';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import type { AuditTrail } from '../../src/modules/audit/application/ports/audit-trail';
import { AcceptLegalDocumentsUseCase } from '../../src/modules/identity/application/use-cases/legal-documents.use-cases';
import { DrizzleLegalDocumentRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-legal-document.repository';
import { captureError, withRollback } from '../support/with-rollback';
import { countM00Residue, countM02Residue } from '../support/residue';
import { createPatient, identityUseCases, publishLegalDocument } from '../support/identity-integration';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

// M03 A2, R-8: la aceptación legal y su evento de auditoría van en la misma UnitOfWork. Contra la BD de PEI,
// con rollback, y solo con tipos de legado: NO requiere 0006.

describe('Aceptación legal y auditoría en la misma UoW (R-8, BD de desarrollo con rollback)', () => {
  let m00Before: Record<string, number>;
  let m02Before: Record<string, number>;

  beforeAll(async () => {
    m00Before = await countM00Residue();
    m02Before = await countM02Residue();
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(m00Before);
    expect(await countM02Residue()).toEqual(m02Before);
  });

  it('[TC-M03-046][R-8] si la auditoría falla, el SAVEPOINT de la UoW revierte también la aceptación', () =>
    withRollback(async () => {
      const patient = await createPatient(identityUseCases());
      const privacy = await publishLegalDocument('privacy_notice', sql`now() - interval '1 second'`);
      const terms = await publishLegalDocument('terms_and_conditions', sql`now() - interval '1 second'`);
      const failingAudit: AuditTrail = {
        record: async () => {
          throw new Error('fallo simulado de auditoría');
        },
      };
      const accept = new AcceptLegalDocumentsUseCase(new DrizzleUnitOfWork(), failingAudit, new DrizzleLegalDocumentRepository());

      const error = await captureError(accept.execute(patient, [privacy, terms]));
      expect((error as Error).message).toBe('fallo simulado de auditoría');
      const { rows } = await transactionStorage.getStore()!.execute(
        sql`select 1 from user_legal_acceptance where user_profile_id = ${patient.userProfileId}`,
      );
      expect(rows).toHaveLength(0);
    }));

  it('[TC-M03-047][R-8] con la auditoría real, la aceptación y su evento se guardan juntos', () =>
    withRollback(async () => {
      const useCases = identityUseCases();
      const patient = await createPatient(useCases);
      const privacy = await publishLegalDocument('privacy_notice', sql`now() - interval '1 second'`);
      const terms = await publishLegalDocument('terms_and_conditions', sql`now() - interval '1 second'`);
      await useCases.acceptLegal.execute(patient, [privacy, terms]);
      const { rows } = await transactionStorage.getStore()!.execute<{ entity_id: string; actor_user_profile_id: string }>(
        sql`select entity_id, actor_user_profile_id from audit_log
             where action = 'identity.legal_document.accepted' and entity_id in (${privacy}, ${terms})`,
      );
      expect(rows.map((r) => r.entity_id).sort()).toEqual([privacy, terms].sort());
      expect(rows.every((r) => r.actor_user_profile_id === patient.userProfileId)).toBe(true);
    }));
});
