import { DomainError } from './domain-error';
import {
  BusinessRuleViolationError,
  ConcurrencyConflictError,
  ExclusionConstraintViolationError,
  IntegrityConstraintViolationError,
  ReferenceViolationError,
  UniqueConstraintViolationError,
} from './persistence.errors';

class SampleRuleError extends DomainError {
  readonly kind = 'business_rule';
  constructor() {
    super('La regla no se cumple');
  }
}

describe('DomainError', () => {
  it('[TC-M00-001][RT-M00-01] una subclase es Error y DomainError, con su nombre de clase y su kind', () => {
    const error = new SampleRuleError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('SampleRuleError');
    expect(error.kind).toBe('business_rule');
    expect(error.message).toBe('La regla no se cumple');
  });

  describe('errores de persistencia', () => {
    const detail = { code: '23505', constraint: 'medication_name_unique', table: 'medication' };

    // Los placeholders del título se llenan en orden con las primeras columnas (nombre y kind, como texto).
    // El Error va al final: con "%s" sobre él, Jest imprimiría su stack en el título.
    it.each([
      ['UniqueConstraintViolationError', 'conflict', new UniqueConstraintViolationError(detail)],
      ['ExclusionConstraintViolationError', 'conflict', new ExclusionConstraintViolationError({ ...detail, code: '23P01' })],
      ['ReferenceViolationError', 'validation', new ReferenceViolationError({ ...detail, code: '23503' })],
      ['IntegrityConstraintViolationError', 'validation', new IntegrityConstraintViolationError({ ...detail, code: '23514' })],
      ['BusinessRuleViolationError', 'business_rule', new BusinessRuleViolationError('mensaje del trigger', { ...detail, code: 'P0001' })],
      ['ConcurrencyConflictError', 'conflict', new ConcurrencyConflictError({ ...detail, code: '55P03' })],
    ] as const)('[TC-M00-002][RT-M00-03][RNF-10] %s tiene kind %s y no expone la constraint en el mensaje', (name, kind, error) => {
      expect(error.name).toBe(name);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.kind).toBe(kind);
      expect(error.detail.constraint).toBe('medication_name_unique');
      expect(error.message).not.toContain('medication_name_unique');
      expect(error.message).not.toContain('medication');
    });

    it('[TC-M00-003][RT-M00-03] BusinessRuleViolationError conserva el mensaje del trigger', () => {
      const error = new BusinessRuleViolationError('La tabla audit_log es de solo inserción', { code: 'P0001' });
      expect(error.message).toBe('La tabla audit_log es de solo inserción');
    });
  });
});
