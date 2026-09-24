// El dominio no sabe qué es Drizzle ni Neon; solo sabe que puede
// "ejecutar trabajo de forma atómica". La implementación real vive en infrastructure/.

export interface UnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');