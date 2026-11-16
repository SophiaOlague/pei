import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { verifyNeonRuntimeIdentity } from '../support/c2-target-guard';
import { db } from '../../src/db';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/application/ports/clock';
import { money, ZERO } from '../../src/modules/payments/domain/money';
import { PAYMENT_PROVIDER, PaymentProviderError, type PaymentProviderPort, type ProviderPaymentSnapshot } from '../../src/modules/payments/application/ports/payment-provider.port';
import { ReconcileProviderFeesUseCase } from '../../src/modules/payments/application/use-cases/reconcile-provider-fees.use-case';
import { createCase, MARK, type BaseFixtures, type CaseFixtures } from '../support/payments-webhook-fixtures';

// Salvaguarda de destino: solo C2, modo `webhooks` (escrituras confirmadas de Payments), conexión directa y su marca.
assertC2BranchTarget();

// H-2/H-3 · Conciliación de la comisión real sobre PostgreSQL REAL (C2), autorizada el 2026-11-16.
//
// Reales: PostgreSQL (payment_guard, payment_fee_reconciled_chk), repositorios, unidad de trabajo, candado del pago y
// ReconcileProviderFeesUseCase. Doble: el proveedor (snapshots sintéticos; nada sale a Stripe). Solo crea 3 citas y 3
// pagos sintéticos (F1, F2, F3) reutilizando los fixtures de c2-20261116071451-5767; las demás filas de C2 no se
// modifican (el proveedor ficticio no conoce sus PaymentIntents: falla sin escribir).
//
// Ejecución: pnpm c2 run webhooks test/webhooks/payments-fee-reconciliation.wh-spec.ts --committed-fixtures wh-h5-committed

const PREVIOUS_MARK = 'wh-h5-c2-20261116071451-5767';
const PREVIOUS_COMPACT = 'c2202611160714515767';
const FEE = money(1_299);
const NET = money(18_701);
const clock = { offsetMs: 0, now: () => new Date(Date.now() + clock.offsetMs) };
const cases: Record<string, CaseFixtures> = {};
const snapshots: Record<string, (c: CaseFixtures) => ProviderPaymentSnapshot> = {};
const base = (c: CaseFixtures, over: Partial<ProviderPaymentSnapshot> = {}): ProviderPaymentSnapshot => ({
  provider: 'stripe', providerPaymentId: c.providerPaymentId, providerStatus: 'succeeded', status: 'succeeded', externalReference: c.paymentId, amount: money(20_000),
  refunded: ZERO, providerFeeActual: FEE, netReceived: NET, moneyReleaseDate: new Date('2099-12-31T00:00:00.000Z'), providerFeeVerified: true, ...over,
});
const provider: PaymentProviderPort = {
  name: 'stripe',
  async createPayment(): Promise<ProviderPaymentSnapshot> {
    throw new Error('H-2: createPayment no debe llamarse');
  },
  async getPayment(pi: string): Promise<ProviderPaymentSnapshot> {
    const entry = Object.entries(cases).find(([, c]) => c.providerPaymentId === pi);
    if (!entry) throw new PaymentProviderError('not_found', 'PaymentIntent ajeno a esta prueba');
    return snapshots[entry[0]](entry[1]);
  },
};
let moduleRef: TestingModule;
const q = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];
const row = async (c: CaseFixtures) => (await q<{ status: string; provider_fee_actual: string | null; net_received_amount: string | null; fee_reconciled_at: string | null; provider_fee_estimated: string }>(sql`
  select status::text, provider_fee_actual::text, net_received_amount::text, fee_reconciled_at, provider_fee_estimated::text from payment where id = ${c.paymentId}`))[0];
const rejects = async (query: ReturnType<typeof sql>) => {
  try {
    await db.execute(query);
    return null;
  } catch (e) {
    return String((e as { cause?: { message?: string } })?.cause?.message ?? (e as Error).message);
  }
};
const results: Record<string, string> = {};
const record = (id: string, fn: () => Promise<void>) => async () => {
  try {
    await fn();
    results[id] = 'PASS';
  } catch (error) {
    results[id] = 'FAIL';
    throw error;
  }
};

beforeAll(async () => {
  await verifyNeonRuntimeIdentity(async (name) => ((await db.execute(sql`select current_setting(${name}, true) as v`)).rows[0]?.v as string) ?? null);
  moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PAYMENT_PROVIDER).useValue(provider)
    .overrideProvider(CLOCK).useValue(clock)
    .compile();
  const [patient] = await q<{ id: string }>(sql`select pp.id from patient_profile pp join user_profile up on up.id = pp.user_profile_id where up.user_id = ${`${PREVIOUS_MARK}-patient`}`);
  const [doctor] = await q<{ id: string }>(sql`select dp.id from doctor_profile dp join user_profile up on up.id = dp.user_profile_id where up.user_id = ${`${PREVIOUS_MARK}-doctor`}`);
  const [ref] = await q<{ policy: string; fee: string; schedule: string }>(sql`
    select a.cancellation_policy_id as policy, p.pei_fee_configuration_id as fee, p.processor_fee_schedule_id as schedule
    from payment p join appointment a on a.id = p.appointment_id where p.provider_payment_id = ${`pi_test_whh5_${PREVIOUS_COMPACT}_01`}`);
  const b: BaseFixtures = { adminProfileId: '', patientProfileId: patient.id, doctorProfileId: doctor.id, policyId: ref.policy, peiFeeId: ref.fee, scheduleId: ref.schedule };
  // F1: cobrado, sin comisión real. F2: cobrado con la comisión ya guardada sin marca (backfill). F3: cobrado, Stripe aún sin balance_transaction.
  for (const [n, slot] of [['F1', 110], ['F2', 111], ['F3', 112]] as const) {
    cases[n] = await createCase(b, n, slot);
    await db.execute(sql`update payment set status = 'succeeded', provider_status = 'succeeded' where id = ${cases[n].paymentId}`);
  }
  await db.execute(sql`update payment set provider_fee_actual = ${'12.99'}, net_received_amount = ${'187.01'} where id = ${cases.F2.paymentId}`);
  snapshots.F1 = (c) => base(c);
  snapshots.F2 = (c) => base(c);
  snapshots.F3 = (c) => base(c, { providerFeeActual: null, netReceived: null, moneyReleaseDate: null, providerFeeVerified: false });
  clock.offsetMs = 10 * 60_000; // los pagos nuevos superan la antigüedad mínima de 5 min
});

afterAll(async () => {
  console.log(`[H-2] marca ${MARK}; pagos ${JSON.stringify(Object.fromEntries(Object.entries(cases).map(([k, c]) => [k, { payment: c.paymentId, pi: c.providerPaymentId }])))}; resultados ${JSON.stringify(results)}`);
  await moduleRef?.close();
});

describe('H-2/H-3 · conciliación de la comisión en PostgreSQL real (C2)', () => {
  it('[H2-PG-01] concilia F1 (comisión nueva) y F2 (backfill) por el flujo bloqueado; F3 queda pendiente', record('H2-PG-01', async () => {
    const summary = await moduleRef.get(ReconcileProviderFeesUseCase).execute({ limit: 500 });
    console.log(`[H-2] resumen ${JSON.stringify(summary)}`);
    expect(summary.reconciled).toBe(2);
    expect(summary.pending).toBe(1);
    expect(await row(cases.F1)).toMatchObject({ status: 'succeeded', provider_fee_actual: '12.99', net_received_amount: '187.01', provider_fee_estimated: '0.00' });
    expect((await row(cases.F1)).fee_reconciled_at).not.toBeNull();
    expect(await row(cases.F2)).toMatchObject({ provider_fee_actual: '12.99', net_received_amount: '187.01' });
    expect((await row(cases.F2)).fee_reconciled_at).not.toBeNull();
    expect(await row(cases.F3)).toMatchObject({ provider_fee_actual: null, net_received_amount: null, fee_reconciled_at: null });
  }));

  it('[H2-PG-02] protecciones reales de PostgreSQL: la marca y los importes se fijan una vez; sin comisión no hay marca', record('H2-PG-02', async () => {
    expect(await rejects(sql`update payment set fee_reconciled_at = now() + interval '1 day' where id = ${cases.F1.paymentId}`)).toMatch(/se fijan una sola vez/);
    expect(await rejects(sql`update payment set provider_fee_actual = 9.99 where id = ${cases.F2.paymentId}`)).toMatch(/se fijan una sola vez/);
    expect(await rejects(sql`update payment set fee_reconciled_at = now() where id = ${cases.F3.paymentId}`)).toMatch(/payment_fee_reconciled_chk/);
    expect((await row(cases.F3)).fee_reconciled_at).toBeNull();
  }));

  it('[H2-PG-03] segunda ejecución: F1 y F2 ya no son pendientes; F3 se concilia cuando Stripe da el balance_transaction', record('H2-PG-03', async () => {
    const f1 = (await row(cases.F1)).fee_reconciled_at;
    snapshots.F3 = (c) => base(c);
    const summary = await moduleRef.get(ReconcileProviderFeesUseCase).execute({ limit: 500 });
    expect(summary.reconciled).toBe(1);
    expect((await row(cases.F1)).fee_reconciled_at).toEqual(f1);
    expect(await row(cases.F3)).toMatchObject({ provider_fee_actual: '12.99', net_received_amount: '187.01' });
    expect((await row(cases.F3)).fee_reconciled_at).not.toBeNull();
  }));
});
