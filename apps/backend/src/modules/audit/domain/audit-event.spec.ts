import { AuditEvent, MAX_METADATA_BYTES } from './audit-event';
import { AuditActor } from './audit-actor';
import { InvalidAuditEventError } from './audit.errors';

const PROFILE_ID = '2f1d6c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';
const ENTITY_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const userActor = AuditActor.fromActor({
  userId: 'user-admin',
  userProfileId: PROFILE_ID,
  role: 'admin',
  ipAddress: '203.0.113.9',
  userAgent: 'PEI-Web/1.0',
});

const valid = (overrides: Partial<Parameters<typeof AuditEvent.create>[0]> = {}) =>
  AuditEvent.create({
    actor: userActor,
    action: 'identity.doctor.approved',
    entity: { type: 'doctor_profile', id: ENTITY_ID },
    metadata: { reason: 'Cédula verificada' },
    ...overrides,
  });

describe('AuditEvent', () => {
  it('[TC-M01-001][RF-52] evento completo: actor, acción, entidad y metadata', () => {
    const event = valid();

    expect(event.actor).toBe(userActor);
    expect(event.action).toBe('identity.doctor.approved');
    expect(event.entityType).toBe('doctor_profile');
    expect(event.entityId).toBe(ENTITY_ID);
    expect(event.metadata).toEqual({ reason: 'Cédula verificada' });
  });

  it('[TC-M01-001][RF-52] la entidad y la metadata son opcionales', () => {
    const event = AuditEvent.create({ actor: userActor, action: 'analytics.adherence_segments.viewed' });
    expect(event.entityType).toBeNull();
    expect(event.entityId).toBeNull();
    expect(event.metadata).toBeNull();
  });

  it('[TC-M01-001][RF-52] tipo de entidad sin id (acción sobre un conjunto)', () => {
    const event = valid({ entity: { type: 'patient_adherence_segment' } });
    expect(event.entityType).toBe('patient_adherence_segment');
    expect(event.entityId).toBeNull();
  });

  it('[TC-M01-003][RN-120] el nombre del proceso del actor sistema queda en metadata.systemProcess', () => {
    const event = valid({ actor: AuditActor.system('scheduler.expire-payment-holds'), metadata: { expired: 3 } });
    expect(event.metadata).toEqual({ expired: 3, systemProcess: 'scheduler.expire-payment-holds' });
  });

  it('[TC-M01-012] correlationId opcional (D8) se guarda en metadata.correlationId', () => {
    expect(valid({ correlationId: 'req-8f3a:1' }).metadata).toEqual({ reason: 'Cédula verificada', correlationId: 'req-8f3a:1' });
    expect(valid().metadata).not.toHaveProperty('correlationId');
  });

  it('[TC-M01-004][RN-120] sin actor → InvalidAuditEventError', () => {
    expect(() => valid({ actor: undefined as never })).toThrow(InvalidAuditEventError);
  });

  it.each([
    [''],
    ['identity'],
    ['identity.doctor'],
    ['Identity.Doctor.Approved'],
    ['identity.doctor.approved!'],
    ['identity..approved'],
    [`identity.doctor.${'a'.repeat(100)}`],
  ])('[TC-M01-005][RF-52] acción "%s" fuera de la convención → InvalidAuditEventError', (action) => {
    expect(() => valid({ action })).toThrow(InvalidAuditEventError);
  });

  it.each([
    ['entity.type en mayúsculas', { type: 'DoctorProfile', id: ENTITY_ID }],
    ['entity.type vacío', { type: '', id: ENTITY_ID }],
    ['entity.id que no es UUID', { type: 'doctor_profile', id: 'doc-1' }],
  ])('[TC-M01-006][RF-52] %s → InvalidAuditEventError', (_label, entity) => {
    expect(() => valid({ entity })).toThrow(InvalidAuditEventError);
  });

  it('[TC-M01-006] correlationId con caracteres no permitidos → InvalidAuditEventError', () => {
    expect(() => valid({ correlationId: 'con espacios' })).toThrow(InvalidAuditEventError);
  });

  describe('metadata (RN-122: límite técnico de forma y tamaño; no valida el significado)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    it.each([
      ['un arreglo', [1, 2]],
      ['una instancia de clase', new Date()],
      ['un valor undefined', { a: undefined }],
      ['una función', { a: () => 1 }],
      ['un Date anidado', { at: new Date() }],
      ['un número no finito', { n: Number.NaN }],
      ['un BigInt', { n: BigInt(1) }],
      ['una referencia circular', circular],
      ['la clave reservada correlationId', { correlationId: 'x' }],
      ['la clave reservada systemProcess', { systemProcess: 'x' }],
    ])('[TC-M01-007][RN-122] metadata con %s → InvalidAuditEventError', (_label, metadata) => {
      expect(() => valid({ metadata: metadata as Record<string, unknown> })).toThrow(InvalidAuditEventError);
    });

    it('[TC-M01-007][RN-122] acepta JSON anidado: objetos, arreglos, null y booleanos', () => {
      const metadata = { from: 'pending', to: 'approved', notified: true, extra: null, tags: ['a', { b: 1 }] };
      expect(valid({ metadata }).metadata).toEqual(metadata);
    });

    it(`[TC-M01-007][RN-122] metadata de exactamente ${MAX_METADATA_BYTES} bytes se acepta; un byte más se rechaza`, () => {
      const overhead = Buffer.byteLength(JSON.stringify({ text: '' }), 'utf8');
      const fits = { text: 'x'.repeat(MAX_METADATA_BYTES - overhead) };
      const tooBig = { text: 'x'.repeat(MAX_METADATA_BYTES - overhead + 1) };

      expect(valid({ metadata: fits }).metadata).toEqual(fits);
      expect(() => valid({ metadata: tooBig })).toThrow(new InvalidAuditEventError(`metadata excede ${MAX_METADATA_BYTES} bytes`));
    });

    it('[TC-M01-007] el límite cuenta bytes UTF-8, no caracteres', () => {
      const overhead = Buffer.byteLength(JSON.stringify({ text: '' }), 'utf8');
      const accents = { text: 'ñ'.repeat(Math.floor((MAX_METADATA_BYTES - overhead) / 2) + 1) }; // 2 bytes por "ñ"
      expect(() => valid({ metadata: accents })).toThrow(InvalidAuditEventError);
    });
  });

  it('[TC-M01-009] el evento y su metadata son inmutables y no dependen del objeto original', () => {
    const metadata = { reason: 'original', nested: { a: 1 } };
    const event = valid({ metadata });
    metadata.reason = 'alterado';
    metadata.nested.a = 2;

    expect(event.metadata).toEqual({ reason: 'original', nested: { a: 1 } });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.metadata)).toBe(true);
    expect(Object.isFrozen((event.metadata as { nested: object }).nested)).toBe(true);
  });
});
