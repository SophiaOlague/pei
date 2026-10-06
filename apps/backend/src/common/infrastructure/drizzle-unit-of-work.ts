import { Injectable } from '@nestjs/common';
import { db } from '../../db';
import { transactionStorage } from '../../db/transaction-context';
import type { UnitOfWork } from '../application/ports/unit-of-work';
import { translatePostgresError } from './postgres-error-translator';

@Injectable()
export class DrizzleUnitOfWork implements UnitOfWork {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    // Con una transacción ya activa, tx.transaction() abre un SAVEPOINT en la misma conexión;
    // sin ella, db.transaction() toma una conexión del pool y abre BEGIN/COMMIT.
    const runner = transactionStorage.getStore() ?? db;
    try {
      return await runner.transaction(async (tx) => transactionStorage.run(tx as any, work));
    } catch (error) {
      throw translatePostgresError(error) ?? error;
    }
  }
}
