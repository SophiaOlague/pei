import type { AuditActor } from './audit-actor';
import { InvalidAuditEventError } from './audit.errors';

// Un evento de audit_log (RF-52): quién (actor), qué (action), sobre qué (entity) y contexto (metadata).
// La fecha NO forma parte del evento: la fija PostgreSQL al insertar (now(): inicio de la transacción).
// Varios eventos de una misma transacción comparten esa fecha; M01 no garantiza un orden total.
//
// Convención de acciones (no hay catálogo cerrado): "dominio.entidad.accion" en minúsculas y snake_case,
// al menos tres segmentos, máximo 100 caracteres. Ejemplos: identity.doctor.approved, dispensing.voucher.redeemed.
//
// metadata: objeto JSON serializable de máximo 4 KB. No debe contener contenido clínico (RN-122) ni datos
// personales innecesarios; esta validación solo comprueba forma y tamaño, no el significado de su contenido.

const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/;
const MAX_ACTION_LENGTH = 100;
const ENTITY_TYPE = /^[a-z][a-z0-9_]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION_ID = /^[A-Za-z0-9._:-]{1,100}$/;

export const MAX_METADATA_BYTES = 4096;

// Claves que llena el propio evento; quien registra no puede usarlas en su metadata.
export const RESERVED_METADATA_KEYS = ['correlationId', 'systemProcess'] as const;

export type AuditMetadata = Readonly<Record<string, unknown>>;

export interface AuditEventInput {
  actor: AuditActor;
  action: string;
  entity?: { type: string; id?: string };
  metadata?: Record<string, unknown>;
  correlationId?: string; // D8: opcional; M01 no lo genera ni lo exige
}

export class AuditEvent {
  private constructor(
    readonly actor: AuditActor,
    readonly action: string,
    readonly entityType: string | null,
    readonly entityId: string | null,
    readonly metadata: AuditMetadata | null,
  ) {
    Object.freeze(this);
  }

  static create(input: AuditEventInput): AuditEvent {
    const { actor, action, entity, metadata, correlationId } = input ?? ({} as AuditEventInput);

    if (!actor || (actor.type !== 'user' && actor.type !== 'system')) {
      throw new InvalidAuditEventError('se requiere un actor (AuditActor.fromActor o AuditActor.system)');
    }
    if (typeof action !== 'string' || action.length > MAX_ACTION_LENGTH || !ACTION.test(action)) {
      throw new InvalidAuditEventError(`la acción "${String(action)}" no sigue la convención dominio.entidad.accion`);
    }

    if (entity !== undefined) {
      if (typeof entity?.type !== 'string' || !ENTITY_TYPE.test(entity.type)) {
        throw new InvalidAuditEventError('entity.type debe estar en snake_case (máx. 64)');
      }
      if (entity.id !== undefined && (typeof entity.id !== 'string' || !UUID.test(entity.id))) {
        throw new InvalidAuditEventError('entity.id debe ser un UUID');
      }
    }

    if (correlationId !== undefined && (typeof correlationId !== 'string' || !CORRELATION_ID.test(correlationId))) {
      throw new InvalidAuditEventError('correlationId inválido');
    }

    return new AuditEvent(
      actor,
      action,
      entity?.type ?? null,
      entity?.id ?? null,
      buildMetadata(metadata, actor, correlationId),
    );
  }
}

function buildMetadata(
  metadata: Record<string, unknown> | undefined,
  actor: AuditActor,
  correlationId: string | undefined,
): AuditMetadata | null {
  if (metadata !== undefined) {
    if (!isPlainObject(metadata)) {
      throw new InvalidAuditEventError('metadata debe ser un objeto');
    }
    assertJsonSerializable(metadata, 'metadata', new Set());
    const reserved = RESERVED_METADATA_KEYS.filter((key) => key in metadata);
    if (reserved.length > 0) {
      throw new InvalidAuditEventError(`metadata no puede usar las claves reservadas: ${reserved.join(', ')}`);
    }
  }

  const result: Record<string, unknown> = { ...metadata };
  if (correlationId !== undefined) result.correlationId = correlationId;
  if (actor.type === 'system') result.systemProcess = actor.process;
  if (Object.keys(result).length === 0) return null;

  const json = JSON.stringify(result);
  if (Buffer.byteLength(json, 'utf8') > MAX_METADATA_BYTES) {
    throw new InvalidAuditEventError(`metadata excede ${MAX_METADATA_BYTES} bytes`);
  }
  // Copia profunda congelada: quien registra no puede alterar el evento después de crearlo.
  return deepFreeze(JSON.parse(json));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Solo valores que JSON representa sin pérdida: null, boolean, número finito, string, arreglos y objetos planos.
function assertJsonSerializable(value: unknown, path: string, ancestors: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new InvalidAuditEventError(`${path} no es un número finito`);
    return;
  }
  if (Array.isArray(value) || isPlainObject(value)) {
    if (ancestors.has(value)) throw new InvalidAuditEventError(`${path} contiene una referencia circular`);
    ancestors.add(value);
    for (const [key, item] of Object.entries(value)) assertJsonSerializable(item, `${path}.${key}`, ancestors);
    ancestors.delete(value);
    return;
  }
  throw new InvalidAuditEventError(`${path} no es serializable a JSON (${describe(value)})`);
}

function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') return Object.getPrototypeOf(value)?.constructor?.name ?? 'object';
  return typeof value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
