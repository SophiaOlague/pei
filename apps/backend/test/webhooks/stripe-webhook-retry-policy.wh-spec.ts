import { sql } from 'drizzle-orm';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { verifyNeonRuntimeIdentity } from '../support/c2-target-guard';
import { db } from '../../src/db';
import { DrizzleWebhookEventRepository } from '../../src/modules/payments/infrastructure/persistence/drizzle-webhook-events.repository';
import { buildRetryableQuery, WEBHOOK_MAX_ATTEMPTS } from '../../src/modules/payments/application/use-cases/provider-webhook.use-cases';
import { COMPACT, MARK } from '../support/payments-webhook-fixtures';

// Salvaguarda de destino: solo C2, modo `webhooks`, conexión directa y la marca de datos confirmados de H-5.
assertC2BranchTarget();

// H-6, etapa 2 · Semántica REAL en PostgreSQL (C2) de la consulta del barrido: backoff acumulado (R-3) y exclusión de
// errores permanentes (R-4). Autorizado el 2026-11-16 con alcance mínimo.
//
// Solo 4 filas de provider_webhook_event, sin pago ni cita (payment_id nulo), marcadas wh-h5-<C2_RUN_ID> en data_id y
// request_id. No se procesa nada: solo se consulta findRetryable con la misma consulta que usa el barrido
// (buildRetryableQuery). Al final se NEUTRALIZAN (processing_attempts = 8, lo único que el guard permite y que las saca
// de cualquier barrido futuro); los triggers impiden borrarlas.
//
// Ejecución: pnpm c2 run webhooks test/webhooks/stripe-webhook-retry-policy.wh-spec.ts --committed-fixtures wh-h5-committed

const pi = (n: string) => `pi_test_whh5_${COMPACT}_${n}`;
const evt = (n: string) => `evt_whh5${COMPACT}${n}`;
const ids: Record<string, string> = {};

async function insertFailed(n: string, attempts: number, minutesAgo: number, lastError: string) {
  const [row] = (await db.execute(sql`
    insert into provider_webhook_event (provider, topic, action, data_id, request_id, signature_valid, payload, status, received_at, processing_attempts, last_error)
    values ('stripe', 'payment', 'payment_intent.succeeded', ${pi(n)}, ${evt(n)}, true, ${JSON.stringify({ h5: MARK })}::jsonb, 'failed',
            now() - make_interval(mins => ${minutesAgo}), ${attempts}, ${lastError}) returning id`)).rows as { id: string }[];
  ids[n] = row.id;
}

beforeAll(async () => {
  await verifyNeonRuntimeIdentity(async (name) => ((await db.execute(sql`select current_setting(${name}, true) as v`)).rows[0]?.v as string) ?? null);
});

afterAll(async () => {
  const list = Object.values(ids);
  if (list.length) {
    await db.execute(sql`update provider_webhook_event set processing_attempts = ${WEBHOOK_MAX_ATTEMPTS} where id in (${sql.join(list.map((id) => sql`${id}::uuid`), sql`, `)})`);
  }
  console.log(`[H-6 E2] marca ${MARK}; filas ${JSON.stringify(ids)}; neutralizadas con processing_attempts = ${WEBHOOK_MAX_ATTEMPTS}`);
});

describe('H-6 etapa 2 · consulta del barrido en PostgreSQL real (C2)', () => {
  it('[H6-PG-03] backoff y errores permanentes: solo es elegible el fallo transitorio fuera de su espera', async () => {
    await insertFailed('B1', 1, 0, 'provider:unavailable'); // transitorio, dentro de la espera (1 min)
    await insertFailed('B2', 1, 5, 'provider:unavailable'); // transitorio, fuera de la espera → elegible
    await insertFailed('B3', 1, 5, 'appointment_mismatch:patient'); // permanente (prefijo con `_`): nunca
    await insertFailed('B4', 3, 5, 'provider:timeout'); // transitorio con 3 intentos: necesita 8 min → no todavía

    const repo = new DrizzleWebhookEventRepository();
    const now = new Date(((await db.execute(sql`select now() as t`)).rows[0] as { t: string | Date }).t);
    const mine = (found: string[]) => Object.entries(ids).filter(([, id]) => found.includes(id)).map(([n]) => n).sort();

    expect(mine(await repo.findRetryable(buildRetryableQuery(now, 500)))).toEqual(['B2']);
    // 10 minutos después: B4 ya superó su espera de 8 min; B3 sigue excluido.
    expect(mine(await repo.findRetryable(buildRetryableQuery(new Date(now.getTime() + 10 * 60_000), 500)))).toEqual(['B1', 'B2', 'B4']);
    // Sin la política (consulta de la etapa 1): las cuatro serían elegibles, también la permanente.
    const { failedReceivedBefore: _a, excludeFailures: _b, ...stage1 } = buildRetryableQuery(now, 500);
    expect(mine(await repo.findRetryable(stage1))).toEqual(['B1', 'B2', 'B3', 'B4']);
  });
});
