import { randomUUID } from 'crypto';
import type { UnitOfWork } from '../../src/common/application/ports/unit-of-work';
import { UniqueConstraintViolationError } from '../../src/common/domain/persistence.errors';
import type { AuditTrail } from '../../src/modules/audit/application/ports/audit-trail';
import type { AuditEvent } from '../../src/modules/audit/domain/audit-event';
import type { SpecialtyRecord, SpecialtyRepository } from '../../src/modules/doctors/application/ports/specialty.repository';

// Dobles en memoria de M03 (sin BD). Reproducen las restricciones de 0009 que importan a los casos de uso:
// specialty_code_unique, specialty_name_lower_uq y specialty_active_chk.

export const INITIAL_SPECIALTIES = [
  { code: 'infectologia', name: 'Infectología' },
  { code: 'psicologia', name: 'Psicología' },
  { code: 'medicina_general', name: 'Medicina general' },
] as const;

export class InMemorySpecialtyCatalog implements SpecialtyRepository {
  rows: SpecialtyRecord[] = [];
  audit: AuditEvent[] = [];

  // Catálogo inicial de 0009 (D-34).
  static seeded(): InMemorySpecialtyCatalog {
    const catalog = new InMemorySpecialtyCatalog();
    for (const s of INITIAL_SPECIALTIES) catalog.insert(s);
    return catalog;
  }

  byCode(code: string): SpecialtyRecord {
    const row = this.rows.find((r) => r.code === code);
    if (!row) throw new Error(`sin especialidad ${code}`);
    return row;
  }

  snapshot() {
    return { rows: structuredClone(this.rows), audit: this.audit.length };
  }
  restore(snapshot: ReturnType<InMemorySpecialtyCatalog['snapshot']>) {
    this.rows = snapshot.rows;
    this.audit = this.audit.slice(0, snapshot.audit);
  }

  private insert(input: { code: string; name: string }): SpecialtyRecord {
    if (this.rows.some((r) => r.code === input.code)) {
      throw new UniqueConstraintViolationError({ code: '23505', constraint: 'specialty_code_unique', table: 'specialty' });
    }
    this.assertNameFree(input.name);
    const now = new Date();
    const row: SpecialtyRecord = { id: randomUUID(), ...input, isActive: true, deactivatedAt: null, createdAt: now, updatedAt: now };
    this.rows.push(row);
    return { ...row };
  }

  private assertNameFree(name: string, exceptId?: string) {
    if (this.rows.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) {
      throw new UniqueConstraintViolationError({ code: '23505', constraint: 'specialty_name_lower_uq', table: 'specialty' });
    }
  }

  private byName = (a: SpecialtyRecord, b: SpecialtyRecord) => a.name.localeCompare(b.name);

  async listActive() {
    return this.rows.filter((r) => r.isActive).sort(this.byName).map((r) => ({ ...r }));
  }
  async listAll() {
    return [...this.rows].sort(this.byName).map((r) => ({ ...r }));
  }
  async lockById(id: string) {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row } : null;
  }
  async findById(id: string) {
    return this.lockById(id);
  }
  async lockForShare(id: string) {
    return this.lockById(id);
  }
  async create(input: { code: string; name: string }) {
    return this.insert(input);
  }
  async updateName(id: string, name: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    this.assertNameFree(name, id);
    Object.assign(row, { name, updatedAt: new Date() });
    return { ...row };
  }
  async setActive(id: string, active: boolean) {
    const row = this.rows.find((r) => r.id === id && r.isActive === !active);
    if (!row) return null;
    Object.assign(row, { isActive: active, deactivatedAt: active ? null : new Date(), updatedAt: new Date() });
    return { ...row };
  }
}

// Revierte el catálogo y los eventos si el trabajo falla (misma UoW, como DrizzleUnitOfWork).
export class InMemorySpecialtyUnitOfWork implements UnitOfWork {
  calls = 0;
  constructor(private readonly catalog: InMemorySpecialtyCatalog) {}
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.calls++;
    const before = this.catalog.snapshot();
    try {
      return await work();
    } catch (error) {
      this.catalog.restore(before);
      throw error;
    }
  }
}

export class InMemorySpecialtyAuditTrail implements AuditTrail {
  fail = false;
  constructor(private readonly catalog: InMemorySpecialtyCatalog) {}
  async record(event: AuditEvent): Promise<void> {
    if (this.fail) throw new Error('fallo simulado de auditoría');
    this.catalog.audit.push(event);
  }
}
