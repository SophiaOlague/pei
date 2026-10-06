import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { getDbContext } from '../../src/db/transaction-context';
import { medication } from '../../src/db/schema';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { UniqueConstraintViolationError } from '../../src/common/domain/persistence.errors';
import { captureError, testTag, withRollback } from '../support/with-rollback';
import { insertMedication } from '../support/fixtures';
import { countM00Residue } from '../support/residue';

class FalloDelCasoDeUso extends Error {}

const medicationsNamed = (...names: string[]) =>
  getDbContext()
    .select({ name: medication.name })
    .from(medication)
    .where(sql`${medication.name} in ${names}`);

describe('DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback)', () => {
  const unitOfWork = new DrizzleUnitOfWork();
  let residueBefore: Record<string, number>;

  beforeAll(async () => {
    residueBefore = await countM00Residue();
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(residueBefore);
    await db.$client.end();
  });

  it('[TC-M00-100][RT-M00-02] confirma todo el trabajo de la unidad de forma atómica', async () => {
    await withRollback(async (tx) => {
      const [a, b] = [testTag(), testTag()];

      await unitOfWork.runInTransaction(async () => {
        await insertMedication(tx, a);
        await insertMedication(tx, b);
      });

      expect(await medicationsNamed(a, b)).toHaveLength(2);
    });
  });

  it('[TC-M00-101][RT-M00-02] si el trabajo falla, revierte todo lo que hizo la unidad', async () => {
    await withRollback(async (tx) => {
      const name = testTag();

      const error = await captureError(
        unitOfWork.runInTransaction(async () => {
          await insertMedication(tx, name);
          throw new FalloDelCasoDeUso();
        }),
      );

      expect(error).toBeInstanceOf(FalloDelCasoDeUso);
      expect(await medicationsNamed(name)).toHaveLength(0);
    });
  });

  it('[TC-M00-102][RT-M00-02] una unidad anidada que falla solo revierte su parte (SAVEPOINT)', async () => {
    await withRollback(async (tx) => {
      const [outer, inner] = [testTag(), testTag()];

      await unitOfWork.runInTransaction(async () => {
        await insertMedication(tx, outer);
        const error = await captureError(
          unitOfWork.runInTransaction(async () => {
            await insertMedication(tx, inner);
            throw new FalloDelCasoDeUso();
          }),
        );
        expect(error).toBeInstanceOf(FalloDelCasoDeUso);
      });

      expect((await medicationsNamed(outer, inner)).map((r) => r.name)).toEqual([outer]);
    });
  });

  it('[TC-M00-103][RT-M00-02] la unidad anidada usa la misma conexión y la misma transacción (no escapa del rollback)', async () => {
    await withRollback(async () => {
      const identity = sql`select pg_backend_pid() as pid, txid_current() as txid`;
      const outside = (await getDbContext().execute(identity)).rows[0];

      const inside = await unitOfWork.runInTransaction(async () =>
        unitOfWork.runInTransaction(async () => (await getDbContext().execute(identity)).rows[0]),
      );

      expect(inside).toEqual(outside);
    });
  });

  it('[TC-M00-106][RT-M00-02] UoW dentro de UoW: un error de PostgreSQL en la interna se revierte a su SAVEPOINT y la externa continúa y termina', async () => {
    await withRollback(async () => {
      const [outerBefore, inner, outerAfter] = [testTag(), testTag(), testTag()];
      const insert = (name: string) => getDbContext().insert(medication).values({ name });

      const outcome = await unitOfWork.runInTransaction(async () => {
        await insert(outerBefore);

        const innerError = await captureError(
          unitOfWork.runInTransaction(async () => {
            await insert(inner);
            await insert(outerBefore); // duplicado → 23505 dentro de la unidad interna
          }),
        );
        expect(innerError).toBeInstanceOf(UniqueConstraintViolationError);

        // Sin SAVEPOINT esta sentencia fallaría con 25P02 (transacción abortada); ver TC-M00-107.
        await insert(outerAfter);
        return 'externa terminada';
      });

      expect(outcome).toBe('externa terminada');
      const names = (await medicationsNamed(outerBefore, inner, outerAfter)).map((r) => r.name).sort();
      expect(names).toEqual([outerBefore, outerAfter].sort());
    });
  });

  it('[TC-M00-107][RT-M00-02] control: sin SAVEPOINT, un error de PostgreSQL aborta la transacción y la siguiente sentencia falla con 25P02', async () => {
    await withRollback(async (tx) => {
      const name = testTag();
      await insertMedication(tx, name);

      // Mismo duplicado, pero directo sobre la transacción, sin unidad de trabajo.
      expect(await captureError(insertMedication(tx, name))).not.toBeNull();

      const next = await captureError(tx.execute(sql`select 1`));
      expect((next as { cause?: { code?: string } }).cause?.code).toBe('25P02');
    });
  });

  it('[TC-M00-104][RT-M00-02] sin transacción activa, una unidad que falla no deja datos (no hay commit)', async () => {
    const name = testTag();

    const error = await captureError(
      unitOfWork.runInTransaction(async () => {
        await getDbContext().insert(medication).values({ name });
        throw new FalloDelCasoDeUso();
      }),
    );

    expect(error).toBeInstanceOf(FalloDelCasoDeUso);
    expect(await db.select().from(medication).where(eq(medication.name, name))).toHaveLength(0);
  });

  it('[TC-M00-105][RT-M00-03] un error de PostgreSQL dentro de la unidad se traduce y la transacción exterior sigue usable', async () => {
    await withRollback(async (tx) => {
      const name = testTag();
      await insertMedication(tx, name);

      const error = await captureError(unitOfWork.runInTransaction(() => insertMedication(tx, name)));

      expect(error).toBeInstanceOf(UniqueConstraintViolationError);
      expect((error as UniqueConstraintViolationError).detail).toEqual({
        code: '23505',
        constraint: 'medication_name_unique',
        table: 'medication',
      });
      // El SAVEPOINT se revirtió: la transacción exterior no quedó abortada.
      expect(await tx.select().from(medication).where(eq(medication.name, name))).toHaveLength(1);
    });
  });
});
