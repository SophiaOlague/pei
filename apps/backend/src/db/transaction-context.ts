import { AsyncLocalStorage } from 'async_hooks';
import { db } from './index';

type DbOrTx = typeof db;

export const transactionStorage = new AsyncLocalStorage<DbOrTx>();

// Los repositorios llaman esto en vez de usar "db" directo,
// para respetar la transacción activa si existe una.
export function getDbContext(): DbOrTx {
  return transactionStorage.getStore() ?? db;
}