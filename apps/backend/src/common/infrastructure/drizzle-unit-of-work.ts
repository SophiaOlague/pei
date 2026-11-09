import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';
import { db } from '../../db';
import { transactionStorage } from '../../db/transaction-context';
import type { AfterCommit, AfterCommitAction } from '../application/ports/after-commit';
import type { UnitOfWork } from '../application/ports/unit-of-work';
import { translatePostgresError } from './postgres-error-translator';
import { runAfterCommitActions } from './after-commit-runner';

// Acciones posteriores al COMMIT de cada unidad de trabajo en curso (ver AfterCommit). Un marco por unidad: al terminar
// bien, una unidad interior pasa sus acciones a la exterior; solo la exterior las ejecuta, después del COMMIT.
interface CommitFrame {
  actions: AfterCommitAction[];
}
const frames = new AsyncLocalStorage<CommitFrame>();

@Injectable()
export class DrizzleUnitOfWork implements UnitOfWork, AfterCommit {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    // Con una transacción ya activa, tx.transaction() abre un SAVEPOINT en la misma conexión;
    // sin ella, db.transaction() toma una conexión del pool y abre BEGIN/COMMIT.
    const runner = transactionStorage.getStore() ?? db;
    const parent = frames.getStore();
    const frame: CommitFrame = { actions: [] };
    let result: T;
    try {
      result = await runner.transaction(async (tx) => transactionStorage.run(tx as any, () => frames.run(frame, work)));
    } catch (error) {
      // Rollback (de la transacción o del SAVEPOINT): las acciones de esta unidad se descartan.
      throw translatePostgresError(error) ?? error;
    }
    if (parent) parent.actions.push(...frame.actions);
    else await runAfterCommitActions(frame.actions);
    return result;
  }

  afterCommit(action: AfterCommitAction): void {
    const frame = frames.getStore();
    if (frame) frame.actions.push(action);
    else void runAfterCommitActions([action]);
  }
}
