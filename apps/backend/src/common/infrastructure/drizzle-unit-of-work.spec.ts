import { DrizzleUnitOfWork } from './drizzle-unit-of-work';
import { getDbContext, transactionStorage } from '../../db/transaction-context';
import { UniqueConstraintViolationError } from '../domain/persistence.errors';
import { SystemClock } from './system-clock';

// Pruebas sin base de datos: una transacción "ambiental" falsa sustituye a la de Drizzle.
// El comportamiento real (BEGIN/SAVEPOINT en PostgreSQL) se prueba en test/integration.
function fakeTransaction() {
  const savepoint = { name: 'savepoint' };
  const tx = {
    transaction: jest.fn(async (callback: (inner: unknown) => Promise<unknown>) => callback(savepoint)),
  };
  return { tx, savepoint };
}

describe('DrizzleUnitOfWork (sin BD)', () => {
  const unitOfWork = new DrizzleUnitOfWork();

  it('[TC-M00-020][RT-M00-02] con una transacción activa abre la unidad dentro de ella y la expone a los repositorios', async () => {
    const { tx, savepoint } = fakeTransaction();

    const seenContext = await transactionStorage.run(tx as any, () =>
      unitOfWork.runInTransaction(async () => getDbContext()),
    );

    expect(tx.transaction).toHaveBeenCalledTimes(1);
    expect(seenContext).toBe(savepoint);
  });

  it('[TC-M00-021][RT-M00-03] traduce el error de PostgreSQL que sale de la transacción', async () => {
    const pgError = Object.assign(new Error('duplicate key'), { code: '23505', severity: 'ERROR', constraint: 'x' });
    const tx = { transaction: jest.fn().mockRejectedValue(Object.assign(new Error('Failed query'), { cause: pgError })) };

    await expect(
      transactionStorage.run(tx as any, () => unitOfWork.runInTransaction(async () => 'ok')),
    ).rejects.toBeInstanceOf(UniqueConstraintViolationError);
  });

  it('[TC-M00-022][RT-M00-02] un error que no es de PostgreSQL se propaga sin cambios', async () => {
    const { tx } = fakeTransaction();
    const failure = new Error('falla del caso de uso');

    await expect(
      transactionStorage.run(tx as any, () =>
        unitOfWork.runInTransaction(async () => {
          throw failure;
        }),
      ),
    ).rejects.toBe(failure);
  });
});

describe('SystemClock', () => {
  it('[TC-M00-023][RT-M00-04] devuelve la hora actual del sistema', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
