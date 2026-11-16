import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';

// Las pruebas de integración usan la BD de desarrollo. Regla: nada de lo que hacen se confirma.
// withRollback abre una transacción, la deja disponible para los repositorios (getDbContext) y
// para la unidad de trabajo (que abre SAVEPOINTs dentro de ella), y al final SIEMPRE la revierte,
// también cuando una aserción falla.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class RollbackSignal extends Error {
  constructor() {
    super('rollback de prueba');
  }
}

export async function withRollback<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      result = await transactionStorage.run(tx as any, () => work(tx));
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
  return result as T;
}

// Identificadores sintéticos (TEST_PREFIX, testTag): ver test-tag.ts, sin dependencia de la BD.
export { C2_RUN_ID_PATTERN, TEST_EMAIL_DOMAIN, TEST_PREFIX, testTag } from './test-tag';

export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// Captura el error de una promesa sin propagarlo (o devuelve null si se resolvió).
export async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}
