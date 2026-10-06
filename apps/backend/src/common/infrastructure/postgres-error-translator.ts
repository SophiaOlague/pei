import { DomainError } from '../domain/domain-error';
import {
  BusinessRuleViolationError,
  ConcurrencyConflictError,
  ExclusionConstraintViolationError,
  IntegrityConstraintViolationError,
  ReferenceViolationError,
  UniqueConstraintViolationError,
  type PostgresErrorDetail,
} from '../domain/persistence.errors';

interface PostgresDatabaseError {
  code: string;
  message: string;
  constraint?: string;
  table?: string;
}

// SQLSTATE: cinco caracteres alfanuméricos en mayúsculas.
const SQLSTATE = /^[0-9A-Z]{5}$/;
const MAX_CAUSE_DEPTH = 5;

// Drizzle envuelve el error del driver en DrizzleQueryError y deja el original en "cause".
// Se recorre la cadena hasta encontrar un error del servidor PostgreSQL (tiene SQLSTATE y
// severity), para no confundirlo con errores de red de Node como EPIPE.
function findPostgresError(error: unknown): PostgresDatabaseError | null {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === 'object' && current !== null; depth++) {
    const candidate = current as Record<string, unknown>;
    if (typeof candidate.code === 'string' && SQLSTATE.test(candidate.code) && typeof candidate.severity === 'string') {
      return candidate as unknown as PostgresDatabaseError;
    }
    current = candidate.cause;
  }
  return null;
}

// Devuelve el error de dominio equivalente, o null si el error no proviene de PostgreSQL
// o su código no tiene traducción (en ese caso debe tratarse como error interno).
export function translatePostgresError(error: unknown): DomainError | null {
  if (error instanceof DomainError) return null;

  const pgError = findPostgresError(error);
  if (!pgError) return null;

  const detail: PostgresErrorDetail = {
    code: pgError.code,
    constraint: pgError.constraint,
    table: pgError.table,
  };

  switch (pgError.code) {
    case '23505':
      return new UniqueConstraintViolationError(detail);
    case '23P01':
      return new ExclusionConstraintViolationError(detail);
    case '23503':
      return new ReferenceViolationError(detail);
    case '23514':
    case '23502':
      return new IntegrityConstraintViolationError(detail);
    case 'P0001':
      return new BusinessRuleViolationError(pgError.message, detail);
    case '40001':
    case '40P01':
    case '55P03':
      return new ConcurrencyConflictError(detail);
    default:
      return null;
  }
}
