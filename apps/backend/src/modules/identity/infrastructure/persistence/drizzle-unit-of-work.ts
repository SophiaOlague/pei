import { Injectable } from '@nestjs/common';
import { db } from '../../../../db';
import { transactionStorage } from '../../../../db/transaction-context';
import type { UnitOfWork } from '../../domain/ports/unit-of-work';

@Injectable()
export class DrizzleUnitOfWork implements UnitOfWork {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      return transactionStorage.run(tx as any, work);
    });
  }
}