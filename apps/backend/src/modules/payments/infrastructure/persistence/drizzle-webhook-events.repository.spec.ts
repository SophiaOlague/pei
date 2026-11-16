import { PgDialect } from 'drizzle-orm/pg-core';
import { transactionStorage } from '../../../../db/transaction-context';
import { IntegrityConstraintViolationError, UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import { ReceiveProviderWebhookUseCase } from '../../application/use-cases/provider-webhook.use-cases';
import type { NewWebhookEvent, ProviderWebhookAuthenticator } from '../../application/ports/provider-webhook.port';
import { claimableCondition, DrizzleWebhookEventRepository, failedBackoffCondition, notPermanentCondition, toWebhookEventRecord } from './drizzle-webhook-events.repository';

// Sin base de datos: mapeo de filas y SQL generado para el reclamo. El comportamiento real frente a
// provider_webhook_event_guard (0017) requiere PostgreSQL y queda pendiente (0017 no está aplicada en ningún destino).
const dialect = new PgDialect();

describe('DrizzleWebhookEventRepository', () => {
  it('mapea la fila sin el payload', () => {
    const at = new Date('2026-11-14T12:00:00Z');
    const r = toWebhookEventRecord({
      id: 'e', provider: 'mercado_pago', topic: 'payment', action: null, dataId: '1', requestId: 'r', signatureValid: true, payload: { a: 1 },
      status: 'failed', paymentId: null, receivedAt: at, processedAt: null, processingAttempts: 2, lastError: 'provider:timeout',
    });
    expect(r).toEqual({ id: 'e', provider: 'mercado_pago', topic: 'payment', action: null, dataId: '1', requestId: 'r', status: 'failed', paymentId: null, receivedAt: at, processedAt: null, processingAttempts: 2, lastError: 'provider:timeout' });
  });

  it('reclamo: received/failed con intentos disponibles y, si se pide, processing abandonado', () => {
    const plain = dialect.sqlToQuery(claimableCondition({ maxAttempts: 8 }));
    expect(plain.sql).toMatch(/"status" in \(\$1, \$2\).*"processing_attempts" < \$3/);
    expect(plain.params).toEqual(['received', 'failed', 8]);
    const reclaim = dialect.sqlToQuery(claimableCondition({ maxAttempts: 8, reclaimProcessingReceivedBefore: new Date('2026-11-14T12:00:00Z') }));
    expect(reclaim.sql).toMatch(/ or .*"status" = \$\d.*"received_at" < \$\d/);
    expect(reclaim.params).toContain('processing');
  });
});

// H5-1 (hallado con PostgreSQL real en C2, 2026-11-16): insert se ejecuta fuera de una unidad de trabajo, así que debe
// traducir él mismo el error del driver. Sin BD: una transacción "ambiental" falsa devuelve el error tal como lo entrega
// Drizzle (DrizzleQueryError con el error de PostgreSQL en `cause`).
const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('Failed query: insert into "provider_webhook_event" …'), {
    cause: Object.assign(new Error('postgres'), { code, severity: 'ERROR', constraint, table: 'provider_webhook_event' }),
  });
const EVENT: NewWebhookEvent = {
  provider: 'stripe', topic: 'payment', action: 'payment_intent.succeeded', dataId: 'pi_test_123456', requestId: 'evt_test_123456',
  payload: {}, status: 'received', receivedAt: new Date('2026-11-16T12:00:00Z'),
};
const ROW = {
  id: 'e-1', provider: 'stripe', topic: 'payment', action: 'payment_intent.succeeded', dataId: 'pi_test_123456', requestId: 'evt_test_123456',
  signatureValid: true, payload: {}, status: 'processed', paymentId: null, receivedAt: EVENT.receivedAt, processedAt: EVENT.receivedAt,
  processingAttempts: 1, lastError: null,
};
// Contexto falso: insert(...).values(...).returning(...) falla con `failure`; select(...).from().where().limit() devuelve `rows`.
function fakeDb(failure: unknown, rows: unknown[] = []) {
  return {
    insert: () => ({ values: () => ({ returning: () => Promise.reject(failure) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) }),
  };
}
const inFakeDb = <T>(db: unknown, work: () => Promise<T>) => transactionStorage.run(db as never, work);

describe('DrizzleWebhookEventRepository.insert · traducción de errores de PostgreSQL (H5-1)', () => {
  const repo = new DrizzleWebhookEventRepository();

  it('[H5-1-U1] 23505 de provider_webhook_event_uq → UniqueConstraintViolationError con la restricción', async () => {
    const error = await inFakeDb(fakeDb(pgError('23505', 'provider_webhook_event_uq')), () => repo.insert(EVENT)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UniqueConstraintViolationError);
    expect((error as UniqueConstraintViolationError).detail).toEqual({ code: '23505', constraint: 'provider_webhook_event_uq', table: 'provider_webhook_event' });
  });

  it('[H5-1-U2] 23505 de OTRA restricción única: se traduce, pero conserva su restricción (no es la del evento)', async () => {
    const error = await inFakeDb(fakeDb(pgError('23505', 'otra_restriccion_uq')), () => repo.insert(EVENT)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UniqueConstraintViolationError);
    expect((error as UniqueConstraintViolationError).detail.constraint).toBe('otra_restriccion_uq');
  });

  it('[H5-1-U3] otro error de PostgreSQL (CHECK, 23514) → su error de dominio, nunca de unicidad', async () => {
    const error = await inFakeDb(fakeDb(pgError('23514', 'provider_webhook_event_keys_chk')), () => repo.insert(EVENT)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IntegrityConstraintViolationError);
    expect(error).not.toBeInstanceOf(UniqueConstraintViolationError);
  });

  it('[H5-1-U4] un error que no es de PostgreSQL (red, inesperado) se relanza sin cambios', async () => {
    const network = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const error = await inFakeDb(fakeDb(network), () => repo.insert(EVENT)).catch((e: unknown) => e);
    expect(error).toBe(network);
  });

  describe('con ReceiveProviderWebhookUseCase y el repositorio real', () => {
    const notification = { provider: 'stripe' as const, topic: 'payment', action: 'payment_intent.succeeded', dataId: EVENT.dataId, requestId: EVENT.requestId, payload: {} };
    const authenticator = { provider: 'stripe', authenticate: () => notification } as unknown as ProviderWebhookAuthenticator;
    const request = { url: '/webhooks/stripe', headers: {}, body: {} };
    const build = () => {
      const dispatcher = { dispatch: jest.fn() };
      const uc = new ReceiveProviderWebhookUseCase({ clock: { now: () => EVENT.receivedAt }, authenticator, events: repo, dispatcher });
      return { uc, dispatcher };
    };

    it('[H5-1-U5] reentrega del mismo evento (23505 de la clave del evento): outcome duplicate, sin error ni redespacho si ya terminó', async () => {
      const { uc, dispatcher } = build();
      const result = await inFakeDb(fakeDb(pgError('23505', 'provider_webhook_event_uq'), [ROW]), () => uc.execute(request));
      expect(result).toEqual({ outcome: 'duplicate', eventId: 'e-1' });
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('[H5-1-U6] reentrega de un evento `failed`: duplicate y se redespacha', async () => {
      const { uc, dispatcher } = build();
      const result = await inFakeDb(fakeDb(pgError('23505', 'provider_webhook_event_uq'), [{ ...ROW, status: 'failed' }]), () => uc.execute(request));
      expect(result).toEqual({ outcome: 'duplicate', eventId: 'e-1' });
      expect(dispatcher.dispatch).toHaveBeenCalledWith('e-1');
    });

    it('[H5-1-U7] 23505 de otra restricción o un CHECK: el error se propaga (no se toma por duplicado)', async () => {
      const { uc } = build();
      await expect(inFakeDb(fakeDb(pgError('23505', 'otra_restriccion_uq')), () => uc.execute(request))).rejects.toBeInstanceOf(UniqueConstraintViolationError);
      await expect(inFakeDb(fakeDb(pgError('23514', 'provider_webhook_event_keys_chk')), () => uc.execute(request))).rejects.toBeInstanceOf(IntegrityConstraintViolationError);
    });
  });
});

// H-6 etapa 2: condiciones SQL del barrido (sin BD; la semántica real se comprueba en C2).
describe('DrizzleWebhookEventRepository.findRetryable · backoff y permanentes (H-6 etapa 2)', () => {
  it('[H6-SQL-01] backoff: por cada número de intentos, received_at anterior a su límite; la última espera cubre el resto', () => {
    const limits = [new Date('2026-11-16T12:00:00Z'), new Date('2026-11-16T11:59:00Z')];
    const q = dialect.sqlToQuery(failedBackoffCondition({ failedReceivedBefore: limits }));
    expect(q.sql).toMatch(/"processing_attempts" = \$1 and "provider_webhook_event"."received_at" < \$2/);
    expect(q.sql).toMatch(/"processing_attempts" >= \$5 and "provider_webhook_event"."received_at" < \$6/);
    expect(q.params).toEqual([0, limits[0].toISOString(), 1, limits[1].toISOString(), 2, limits[1].toISOString()]);
    expect(dialect.sqlToQuery(failedBackoffCondition({})).sql).toBe('true');
  });

  it('[H6-SQL-02] permanentes: igualdad exacta o prefijo con left() (sin LIKE) y coalesce para last_error nulo', () => {
    const q = dialect.sqlToQuery(notPermanentCondition({ excludeFailures: [{ kind: 'exact', value: 'provider:not_found' }, { kind: 'prefix', value: 'appointment_mismatch:' }] }));
    expect(q.sql).toBe(`not (coalesce("provider_webhook_event"."last_error", '') = $1 or left(coalesce("provider_webhook_event"."last_error", ''), $2) = $3)`);
    expect(q.params).toEqual(['provider:not_found', 'appointment_mismatch:'.length, 'appointment_mismatch:']);
    expect(q.sql).not.toMatch(/like/i);
    expect(dialect.sqlToQuery(notPermanentCondition({})).sql).toBe('true');
  });
});
