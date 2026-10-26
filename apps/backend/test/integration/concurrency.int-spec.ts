import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { cancellationPolicy, medication } from '../../src/db/schema';
import { translatePostgresError } from '../../src/common/infrastructure/postgres-error-translator';
import { ConcurrencyConflictError } from '../../src/common/domain/persistence.errors';
import { captureError, deferred, RollbackSignal, testTag, type Tx } from '../support/with-rollback';
import { insertUserWithProfile, policyDatesBeforeExisting } from '../support/fixtures';
import { countM00Residue } from '../support/residue';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

// Concurrencia real con dos conexiones a PostgreSQL. Ninguna transacción se confirma:
// la conexión A inserta y espera sin COMMIT; la conexión B intenta lo mismo. Al final ambas
// terminan en ROLLBACK. Es el mismo mecanismo que protegerá la doble reserva de citas.

async function insertPolicy(tx: Tx, from: Date, until: Date) {
  const { profile } = await insertUserWithProfile(tx, 'admin');
  await tx.insert(cancellationPolicy).values({
    refundDeadlineHours: 24,
    maxReschedules: 2,
    doctorWaitMinutes: 30,
    patientToleranceMinutes: 15,
    effectiveFrom: from,
    effectiveUntil: until,
    createdBy: profile.id,
  });
}

// Abre la transacción A, ejecuta "insert" y la mantiene abierta hasta release(); luego la revierte.
function holdOpenTransaction(insert: (tx: Tx) => Promise<unknown>) {
  const inserted = deferred();
  const release = deferred();
  const outcome = captureError(
    db.transaction(async (tx) => {
      await insert(tx);
      inserted.resolve();
      await release.promise;
      throw new RollbackSignal();
    }),
  );
  // Si A falla antes de insertar, no se queda esperando.
  const ready = Promise.race([
    inserted.promise,
    outcome.then((error) => {
      throw error ?? new Error('La transacción A terminó antes de insertar');
    }),
  ]);
  return { ready, release: () => release.resolve(), outcome };
}

async function waitUntilBlockedOnLock(queryPrefix: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await db.execute<{ waiting: string }>(sql`
      select count(*) as waiting from pg_stat_activity
       where datname = current_database() and wait_event_type = 'Lock' and query ilike ${queryPrefix + '%'}
    `);
    if (Number(rows[0].waiting) > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Ninguna sesión quedó esperando un lock para: ${queryPrefix}`);
}

describe('Concurrencia a nivel PostgreSQL (dos conexiones, sin commits)', () => {
  let residueBefore: Record<string, number>;

  beforeAll(async () => {
    residueBefore = await countM00Residue();
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(residueBefore);
    await db.$client.end();
  });

  it('[TC-M00-140][RT-M00-05][RNF-17] exclusion constraint: un rango sin confirmar de A bloquea el rango solapado de B (lock_timeout → ConcurrencyConflictError)', async () => {
    // Fechas que no se solapan con políticas reales; A y B usan la misma ventana.
    const day = await policyDatesBeforeExisting();
    const a = holdOpenTransaction((tx) => insertPolicy(tx, day(1), day(10)));
    try {
      await a.ready;

      const errorB = await captureError(
        db.transaction(async (tx) => {
          await tx.execute(sql`set local lock_timeout = '2s'`);
          await insertPolicy(tx, day(5), day(20));
          throw new RollbackSignal();
        }),
      );

      const translated = translatePostgresError(errorB);
      expect(translated).toBeInstanceOf(ConcurrencyConflictError);
      expect((translated as ConcurrencyConflictError).detail.code).toBe('55P03');
    } finally {
      a.release();
    }
    expect(await a.outcome).toBeInstanceOf(RollbackSignal);
  });

  it('[TC-M00-141][RT-M00-05] índice único: B espera a A; si A se revierte, B continúa sin falso conflicto', async () => {
    const name = testTag();
    const a = holdOpenTransaction((tx) => tx.insert(medication).values({ name }));
    let outcomeB: Promise<unknown> | undefined;
    try {
      await a.ready;

      let insertedByB = false;
      outcomeB = captureError(
        db.transaction(async (tx) => {
          await tx.insert(medication).values({ name });
          insertedByB = true;
          throw new RollbackSignal();
        }),
      );

      // Evidencia de que B está bloqueada por A (y no terminó por su cuenta).
      await waitUntilBlockedOnLock('insert into "medication"');
      expect(insertedByB).toBe(false);

      a.release(); // A hace ROLLBACK → B puede continuar
      expect(await outcomeB).toBeInstanceOf(RollbackSignal);
      expect(insertedByB).toBe(true);
    } finally {
      a.release();
      await outcomeB;
    }
    expect(await a.outcome).toBeInstanceOf(RollbackSignal);
  });
});
