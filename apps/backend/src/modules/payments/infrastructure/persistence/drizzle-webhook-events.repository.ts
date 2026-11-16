import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { translatePostgresError } from '../../../../common/infrastructure/postgres-error-translator';
import { providerWebhookEvent } from '../../../../db/schema';
import type {
  ClaimOptions,
  NewWebhookEvent,
  RetryableQuery,
  WebhookEventOutcome,
  WebhookEventRecord,
  WebhookEventRepository,
} from '../../application/ports/provider-webhook.port';
import type { ProviderName } from '../../application/ports/payment-provider.port';

// provider_webhook_event (0017). Respeta provider_webhook_event_guard: lo recibido es inmutable, payment_id se fija una
// vez, processed/ignored no cambian de estado y los intentos no disminuyen. Solo se registran eventos con firma válida.

type Row = typeof providerWebhookEvent.$inferSelect;
const t = providerWebhookEvent;

export function toWebhookEventRecord(r: Row): WebhookEventRecord {
  return {
    id: r.id,
    provider: r.provider,
    topic: r.topic,
    action: r.action,
    dataId: r.dataId,
    requestId: r.requestId,
    status: r.status,
    paymentId: r.paymentId,
    receivedAt: r.receivedAt,
    processedAt: r.processedAt,
    processingAttempts: r.processingAttempts,
    lastError: r.lastError,
  };
}

// Condición de reclamo: received o failed con intentos disponibles; opcionalmente, processing abandonado.
export function claimableCondition(options: Pick<ClaimOptions, 'maxAttempts' | 'reclaimProcessingReceivedBefore'>): SQL {
  const attempts = lt(t.processingAttempts, options.maxAttempts);
  const pending = and(inArray(t.status, ['received', 'failed']), attempts)!;
  if (!options.reclaimProcessingReceivedBefore) return pending;
  return or(pending, and(eq(t.status, 'processing'), lt(t.receivedAt, options.reclaimProcessingReceivedBefore), attempts))!;
}

// H-6 etapa 2 (R-3): un `failed` con n intentos solo es elegible si se recibió antes de failedReceivedBefore[n].
export function failedBackoffCondition(query: Pick<RetryableQuery, 'failedReceivedBefore'>): SQL {
  const limits = query.failedReceivedBefore;
  if (!limits || limits.length === 0) return sql`true`;
  const byAttempts = limits.map((before, n) => and(eq(t.processingAttempts, n), lt(t.receivedAt, before))!);
  // Más intentos que entradas en la lista: se aplica la última espera.
  byAttempts.push(and(gte(t.processingAttempts, limits.length), lt(t.receivedAt, limits[limits.length - 1]))!);
  return or(...byAttempts)!;
}

// H-6 etapa 2 (R-4): excluye los last_error permanentes. Comparación exacta o por prefijo con left() (sin LIKE: los
// códigos contienen `_`); coalesce evita que un last_error nulo excluya la fila.
export function notPermanentCondition(query: Pick<RetryableQuery, 'excludeFailures'>): SQL {
  const matchers = query.excludeFailures ?? [];
  if (matchers.length === 0) return sql`true`;
  const error = sql`coalesce(${t.lastError}, '')`;
  const matches = matchers.map((m) => (m.kind === 'exact' ? sql`${error} = ${m.value}` : sql`left(${error}, ${m.value.length}) = ${m.value}`));
  return sql`not (${sql.join(matches, sql` or `)})`;
}

@Injectable()
export class DrizzleWebhookEventRepository implements WebhookEventRepository {
  // Se ejecuta fuera de una unidad de trabajo (la recepción no abre transacción), así que traduce aquí el error de
  // PostgreSQL, igual que DrizzleUnitOfWork: un 23505 de provider_webhook_event_uq llega como
  // UniqueConstraintViolationError y ReceiveProviderWebhookUseCase lo reconoce como reentrega (H5-1). Cualquier otro
  // error de PostgreSQL se traduce a su error de dominio y uno que no sea de PostgreSQL se relanza sin cambios.
  async insert(event: NewWebhookEvent): Promise<string> {
    try {
      const [row] = await getDbContext().insert(t).values({
        provider: event.provider,
        topic: event.topic,
        action: event.action,
        dataId: event.dataId,
        requestId: event.requestId,
        signatureValid: true,
        payload: event.payload,
        status: event.status,
        receivedAt: event.receivedAt,
      }).returning({ id: t.id });
      return row.id;
    } catch (error) {
      throw translatePostgresError(error) ?? error;
    }
  }

  async findByKey(key: { provider: ProviderName; topic: string; dataId: string; requestId: string }): Promise<WebhookEventRecord | null> {
    const [row] = await getDbContext().select().from(t)
      .where(and(eq(t.provider, key.provider), eq(t.topic, key.topic), eq(t.dataId, key.dataId), eq(t.requestId, key.requestId))).limit(1);
    return row ? toWebhookEventRecord(row) : null;
  }

  // UPDATE condicional atómico: dos procesos no reclaman el mismo evento a la vez.
  async claim(id: string, options: ClaimOptions): Promise<WebhookEventRecord | null> {
    const [row] = await getDbContext().update(t)
      .set({ status: 'processing', processingAttempts: sql`${t.processingAttempts} + 1` })
      .where(and(eq(t.id, id), claimableCondition(options)))
      .returning();
    return row ? toWebhookEventRecord(row) : null;
  }

  async finish(id: string, outcome: WebhookEventOutcome): Promise<void> {
    await getDbContext().update(t)
      .set({
        status: outcome.status,
        ...(outcome.status === 'processed' ? { processedAt: outcome.at } : {}),
        lastError: outcome.lastError ?? null,
        // payment_id se fija una sola vez: coalesce conserva el ya registrado.
        ...(outcome.paymentId ? { paymentId: sql`coalesce(${t.paymentId}, ${outcome.paymentId}::uuid)` } : {}),
      })
      .where(and(eq(t.id, id), notInArray(t.status, ['processed', 'ignored'])));
  }

  async findRetryable(query: RetryableQuery): Promise<string[]> {
    const attempts = lt(t.processingAttempts, query.maxAttempts);
    const rows = await getDbContext().select({ id: t.id }).from(t)
      .where(or(
        and(eq(t.status, 'received'), lt(t.receivedAt, query.receivedBefore), attempts),
        and(eq(t.status, 'failed'), attempts, failedBackoffCondition(query), notPermanentCondition(query)),
        and(eq(t.status, 'processing'), lt(t.receivedAt, query.processingReceivedBefore), attempts),
      ))
      .orderBy(asc(t.receivedAt))
      .limit(query.limit);
    return rows.map((r) => r.id);
  }
}
