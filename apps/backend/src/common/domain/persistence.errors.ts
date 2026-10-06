import { DomainError } from './domain-error';

// Errores de dominio que representan violaciones detectadas por PostgreSQL.
// Conservan el detalle técnico (código, constraint, tabla) para que un caso de uso pueda
// convertirlos en un error más específico (por ejemplo, un horario ya reservado), pero
// su mensaje es genérico: nunca se exponen nombres de constraints ni SQL al cliente.

export interface PostgresErrorDetail {
  code: string;
  constraint?: string;
  table?: string;
}

abstract class PersistenceError extends DomainError {
  constructor(
    message: string,
    public readonly detail: PostgresErrorDetail,
  ) {
    super(message);
  }
}

// 23505 unique_violation
export class UniqueConstraintViolationError extends PersistenceError {
  readonly kind = 'conflict';
  constructor(detail: PostgresErrorDetail) {
    super('El registro ya existe', detail);
  }
}

// 23P01 exclusion_violation (por ejemplo, rangos de vigencia o de horario que se solapan)
export class ExclusionConstraintViolationError extends PersistenceError {
  readonly kind = 'conflict';
  constructor(detail: PostgresErrorDetail) {
    super('El registro se solapa con otro existente', detail);
  }
}

// 23503 foreign_key_violation
export class ReferenceViolationError extends PersistenceError {
  readonly kind = 'validation';
  constructor(detail: PostgresErrorDetail) {
    super('El registro hace referencia a un recurso inexistente o en uso', detail);
  }
}

// 23514 check_violation y 23502 not_null_violation
export class IntegrityConstraintViolationError extends PersistenceError {
  readonly kind = 'validation';
  constructor(detail: PostgresErrorDetail) {
    super('Los datos no cumplen las restricciones de integridad', detail);
  }
}

// P0001 raise_exception: los triggers del proyecto (0001_triggers.sql) usan este código
// para reglas de negocio protegidas en la base de datos. Sus mensajes los escribe el proyecto
// y están pensados para mostrarse.
export class BusinessRuleViolationError extends PersistenceError {
  readonly kind = 'business_rule';
  constructor(message: string, detail: PostgresErrorDetail) {
    super(message, detail);
  }
}

// 40001 serialization_failure, 40P01 deadlock_detected, 55P03 lock_not_available
export class ConcurrencyConflictError extends PersistenceError {
  readonly kind = 'conflict';
  constructor(detail: PostgresErrorDetail) {
    super('Otra operación modificó el mismo recurso al mismo tiempo; intenta de nuevo', detail);
  }
}
