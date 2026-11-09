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

describe('DrizzleUnitOfWork: acciones AFTER_COMMIT (sin BD)', () => {
  const unitOfWork = new DrizzleUnitOfWork();
  // Transacción falsa: `fail` simula el rollback rechazando la promesa de transaction().
  const ambient = (fail = false) => ({
    transaction: jest.fn(async (callback: (inner: unknown) => Promise<unknown>) => {
      const result = await callback({ transaction: async (cb: (t: unknown) => Promise<unknown>) => cb({}) });
      if (fail) throw new Error('rollback');
      return result;
    }),
  });

  it('[TC-M00-024][RF-51] la acción se ejecuta después de que transaction() termina bien, nunca antes', async () => {
    const order: string[] = [];
    const tx = ambient();
    await transactionStorage.run(tx as any, () =>
      unitOfWork.runInTransaction(async () => {
        unitOfWork.afterCommit(() => {
          order.push('acción');
        });
        order.push('trabajo');
      }),
    );
    expect(order).toEqual(['trabajo', 'acción']);
  });

  it('[TC-M00-025][RF-51] con rollback la acción se descarta; una unidad interior fallida descarta solo las suyas', async () => {
    const ran: string[] = [];
    await expect(transactionStorage.run(ambient(true) as any, () =>
      unitOfWork.runInTransaction(async () => unitOfWork.afterCommit(() => {
        ran.push('exterior-revertida');
      })),
    )).rejects.toThrow('rollback');
    await transactionStorage.run(ambient() as any, () =>
      unitOfWork.runInTransaction(async () => {
        await unitOfWork.runInTransaction(async () => unitOfWork.afterCommit(() => {
          ran.push('interior-ok');
        }));
        await unitOfWork.runInTransaction(async () => {
          unitOfWork.afterCommit(() => {
            ran.push('interior-fallida');
          });
          throw new Error('fallo interior');
        }).catch(() => undefined);
        // La interior que terminó bien no se ejecuta hasta que termine la exterior.
        expect(ran).toEqual([]);
      }),
    );
    expect(ran).toEqual(['interior-ok']);
  });

  it('[TC-M00-026][RF-51] una acción que falla no afecta al resultado ni a las siguientes; fuera de una unidad se ejecuta enseguida', async () => {
    const ran: string[] = [];
    const result = await transactionStorage.run(ambient() as any, () =>
      unitOfWork.runInTransaction(async () => {
        unitOfWork.afterCommit(() => {
          throw new Error('suscriptor caído');
        });
        unitOfWork.afterCommit(() => {
          ran.push('segunda');
        });
        return 'ok';
      }),
    );
    expect(result).toBe('ok');
    expect(ran).toEqual(['segunda']);
    unitOfWork.afterCommit(() => {
      ran.push('sin-unidad');
    });
    await new Promise((r) => setImmediate(r));
    expect(ran).toEqual(['segunda', 'sin-unidad']);
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
