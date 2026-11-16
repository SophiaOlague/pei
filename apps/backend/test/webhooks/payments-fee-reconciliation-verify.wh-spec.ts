import { sql } from 'drizzle-orm';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { verifyNeonRuntimeIdentity } from '../support/c2-target-guard';
import { db } from '../../src/db';
import { DrizzlePaymentRepository } from '../../src/modules/payments/infrastructure/persistence/drizzle-payments.repositories';

// Salvaguarda de destino: solo C2, modo `webhooks`, conexión directa y su marca.
assertC2BranchTarget();

// H-2/H-3 · Revalidación SIN ESCRITURAS de H2-PG-01 y H2-PG-03 (2026-11-16) sobre los datos que dejó la ejecución
// c2-20261116180614-8590, con la comparación de timestamps corregida (el SQL crudo devuelve fee_reconciled_at como
// texto). No crea filas, no ejecuta el barrido y no modifica ningún pago: solo lee los pagos F1, F2 y F3 y la consulta de
// pendientes. La conciliación en sí ya ocurrió en esa ejecución (resumen: 2 conciliados y 1 pendiente; después 1 más).
//
// Ejecución: pnpm c2 run webhooks test/webhooks/payments-fee-reconciliation-verify.wh-spec.ts --committed-fixtures wh-h5-committed

const RUN = 'c2-20261116180614-8590';
const COMPACT = RUN.replace(/-/g, '');
const pi = (n: string) => `pi_test_whh5_${COMPACT}_${n}`;
type Row = { id: string; status: string; fee: string | null; net: string | null; estimated: string; doctor_net: string; reconciled_at: string | null; created_at: string };
const rows: Record<string, Row> = {};

beforeAll(async () => {
  await verifyNeonRuntimeIdentity(async (name) => ((await db.execute(sql`select current_setting(${name}, true) as v`)).rows[0]?.v as string) ?? null);
  for (const n of ['F1', 'F2', 'F3']) {
    const [r] = (await db.execute(sql`
      select id, status::text, provider_fee_actual::text as fee, net_received_amount::text as net, provider_fee_estimated::text as estimated,
             doctor_net_amount::text as doctor_net, fee_reconciled_at::text as reconciled_at, created_at::text
      from payment where provider_payment_id = ${pi(n)}`)).rows as Row[];
    if (!r) throw new Error(`H-2: no existe el pago ${n} de ${RUN}`);
    rows[n] = r;
  }
});

describe('H-2/H-3 · revalidación sin escrituras (C2)', () => {
  it('[H2-PG-01R] F1 (comisión nueva) y F2 (backfill) quedaron conciliados con la comisión real; sin estimación ni cambio del neto del médico', () => {
    for (const n of ['F1', 'F2']) {
      expect(rows[n]).toMatchObject({ status: 'succeeded', fee: '12.99', net: '187.01', estimated: '0.00', doctor_net: '180.00' });
      expect(rows[n].reconciled_at).not.toBeNull();
      expect(Number.isNaN(Date.parse(rows[n].reconciled_at!))).toBe(false);
      // La marca es posterior a la creación del pago.
      expect(Date.parse(rows[n].reconciled_at!)).toBeGreaterThan(Date.parse(rows[n].created_at));
    }
  });

  it('[H2-PG-03R] F3 se concilió en la segunda ejecución, después que F1, y ninguno vuelve a estar pendiente', async () => {
    expect(rows.F3).toMatchObject({ status: 'succeeded', fee: '12.99', net: '187.01', doctor_net: '180.00' });
    expect(rows.F3.reconciled_at).not.toBeNull();
    expect(Date.parse(rows.F3.reconciled_at!)).toBeGreaterThan(Date.parse(rows.F1.reconciled_at!));
    // Consulta real de pendientes (solo lectura), con un corte posterior a todo: F1, F2 y F3 no aparecen.
    const pending = await new DrizzlePaymentRepository().findPendingFeeReconciliation({ provider: 'stripe', createdBefore: new Date(Date.now() + 86_400_000), limit: 1000 });
    expect(pending).not.toEqual(expect.arrayContaining([rows.F1.id]));
    expect(pending.filter((id) => [rows.F1.id, rows.F2.id, rows.F3.id].includes(id))).toEqual([]);
  });
});
