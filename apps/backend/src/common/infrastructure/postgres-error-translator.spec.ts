import { translatePostgresError } from './postgres-error-translator';
import {
  BusinessRuleViolationError,
  ConcurrencyConflictError,
  ExclusionConstraintViolationError,
  IntegrityConstraintViolationError,
  ReferenceViolationError,
  UniqueConstraintViolationError,
} from '../domain/persistence.errors';
import { DomainError } from '../domain/domain-error';

// Forma del error del driver: pg/@neondatabase/serverless exponen code, severity, constraint y table.
function pgError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`pg error ${code}`), { code, severity: 'ERROR', ...extra });
}

// Forma de DrizzleQueryError: envuelve el error del driver en "cause".
function wrapped(cause: unknown) {
  return Object.assign(new Error('Failed query: insert into ...'), { cause });
}

describe('translatePostgresError', () => {
  it.each([
    ['23505', UniqueConstraintViolationError],
    ['23P01', ExclusionConstraintViolationError],
    ['23503', ReferenceViolationError],
    ['23514', IntegrityConstraintViolationError],
    ['23502', IntegrityConstraintViolationError],
    ['P0001', BusinessRuleViolationError],
    ['40001', ConcurrencyConflictError],
    ['40P01', ConcurrencyConflictError],
    ['55P03', ConcurrencyConflictError],
  ])('[TC-M00-010][RT-M00-03] SQLSTATE %s → %p', (code, ErrorClass) => {
    const translated = translatePostgresError(wrapped(pgError(code, { constraint: 'c', table: 't' })));

    expect(translated).toBeInstanceOf(ErrorClass);
    expect((translated as any).detail).toEqual({ code, constraint: 'c', table: 't' });
  });

  it('[TC-M00-011][RT-M00-03] P0001 conserva el mensaje escrito por el trigger', () => {
    const translated = translatePostgresError(
      wrapped(pgError('P0001', { message: 'La tabla audit_log es de solo inserción: no admite UPDATE' })),
    );
    expect(translated?.message).toBe('La tabla audit_log es de solo inserción: no admite UPDATE');
  });

  it('[TC-M00-012][RT-M00-03] encuentra el error del driver directamente o a varios niveles de "cause"', () => {
    expect(translatePostgresError(pgError('23505'))).toBeInstanceOf(UniqueConstraintViolationError);
    expect(translatePostgresError(wrapped(wrapped(wrapped(pgError('23505')))))).toBeInstanceOf(
      UniqueConstraintViolationError,
    );
  });

  it('[TC-M00-013][RT-M00-03] deja de buscar después de 5 niveles de "cause"', () => {
    let error: unknown = pgError('23505');
    for (let i = 0; i < 5; i++) error = wrapped(error);
    expect(translatePostgresError(error)).toBeNull();
  });

  it.each([
    ['error genérico', new Error('boom')],
    ['error de red de Node con code de 5 letras pero sin severity', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })],
    ['SQLSTATE sin traducción (42P01 tabla inexistente)', pgError('42P01')],
    ['valor que no es objeto', 'texto'],
    ['null', null],
  ])('[TC-M00-014][RT-M00-03] %s → null (se trata como error interno)', (_label, error) => {
    expect(translatePostgresError(error)).toBeNull();
  });

  it('[TC-M00-015][RT-M00-03] un DomainError no se vuelve a traducir', () => {
    const domainError = new UniqueConstraintViolationError({ code: '23505' });
    expect(domainError).toBeInstanceOf(DomainError);
    expect(translatePostgresError(domainError)).toBeNull();
  });
});
