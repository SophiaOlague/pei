import { getTableColumns } from 'drizzle-orm';
import { idempotencyKey, payment } from '../../../../db/schema';
import { money } from '../../domain/money';
import type { NewPaymentRecord } from '../../application/ports/payments.repositories';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FEE_RECONCILABLE_STATUSES, pendingFeeReconciliationCondition, toPaymentInsert, toPaymentRecord, toPaymentUpdate } from './drizzle-payments.repositories';

// Persistencia de pagos SIN base de datos: el mapeo entre las filas de 0017 y el registro de dominio. Las consultas se
// verifican contra el esquema real en C2 cuando se autorice (no aquí).
const NOW = new Date('2026-11-11T12:00:00Z');
const NEW: NewPaymentRecord = {
  id: '00000000-0000-4000-8000-000000000001', type: 'consultation', provider: 'mercado_pago', status: 'pending',
  patientId: 'pat', doctorId: 'doc', appointmentId: 'apt', medicationOrderId: null, gross: money(100_000),
  peiFeeConfigurationId: 'fee', peiFixedFee: money(20_000), doctorNet: money(80_000), processorFeeScheduleId: 'sch',
  providerFeeEstimated: money(4164), createdAt: NOW,
};

describe('Persistencia de pagos · mapeo con 0017', () => {
  it('el alta usa solo columnas de payment y numeric como texto exacto', () => {
    const row = toPaymentInsert(NEW);
    const columns = new Set(Object.keys(getTableColumns(payment)));
    for (const key of Object.keys(row)) expect(columns.has(key)).toBe(true);
    expect(row).toMatchObject({ amount: '1000.00', peiFixedFee: '200.00', doctorNetAmount: '800.00', providerFeeEstimated: '41.64', currency: 'MXN', status: 'pending' });
    // El alta no fija referencias del proveedor ni datos de conciliación (se fijan una sola vez después).
    for (const k of ['providerPaymentId', 'providerStatus', 'providerFeeActual', 'netReceivedAmount', 'moneyReleaseDate', 'feeReconciledAt']) {
      expect(row).not.toHaveProperty(k);
    }
  });

  it('la lectura convierte numeric a centavos sin coma flotante y conserva estimada y real por separado', () => {
    const record = toPaymentRecord({
      ...(toPaymentInsert(NEW) as Required<ReturnType<typeof toPaymentInsert>>),
      id: NEW.id, providerPaymentId: '987', providerStatus: 'approved/accredited', status: 'succeeded', providerFeeActual: '40.64',
      netReceivedAmount: '959.36', moneyReleaseDate: NOW, feeReconciledAt: null, createdAt: NOW, updatedAt: NOW,
    } as typeof payment.$inferSelect);
    expect(record.gross.cents).toBe(100_000);
    expect(record.providerFeeEstimated.cents).toBe(4164);
    expect(record.providerFeeActual?.cents).toBe(4064);
    expect(record.netReceived?.cents).toBe(95_936);
    expect(record.providerStatus).toBe('approved/accredited');
  });

  it('la actualización solo incluye los campos indicados (nunca el snapshot)', () => {
    expect(toPaymentUpdate({ updatedAt: NOW, status: 'failed' })).toEqual({ updatedAt: NOW, status: 'failed' });
    const full = toPaymentUpdate({ updatedAt: NOW, providerPaymentId: '1', providerStatus: 'approved', status: 'succeeded', providerFeeActual: money(4064), netReceived: money(95_936), moneyReleaseDate: NOW });
    expect(full).toEqual({ updatedAt: NOW, providerPaymentId: '1', providerStatus: 'approved', status: 'succeeded', providerFeeActual: '40.64', netReceivedAmount: '959.36', moneyReleaseDate: NOW });
    for (const k of ['amount', 'peiFixedFee', 'doctorNetAmount', 'providerFeeEstimated', 'processorFeeScheduleId']) expect(full).not.toHaveProperty(k);
  });

  it('las tablas usadas existen en Drizzle con las columnas de 0017 (sin columnas nuevas)', () => {
    expect(Object.keys(getTableColumns(idempotencyKey)).sort()).toEqual(['completedAt', 'createdAt', 'id', 'key', 'paymentId', 'refundId', 'requestHash', 'scope']);
    expect(Object.keys(getTableColumns(payment))).toEqual(expect.arrayContaining(['providerPaymentId', 'providerStatus', 'providerFeeEstimated', 'providerFeeActual', 'peiFixedFee', 'doctorNetAmount']));
  });
});

// H-2/H-3 (sin BD): consulta de pendientes y escritura de la marca. La semántica real se comprueba en C2.
describe('Persistencia de pagos · conciliación de la comisión (H-2/H-3)', () => {
  it('[H2-SQL-01] pendientes: proveedor, con PaymentIntent, sin fee_reconciled_at, con cobro capturado y anteriores al corte', () => {
    const before = new Date('2026-11-16T11:55:00Z');
    const q = new PgDialect().sqlToQuery(pendingFeeReconciliationCondition({ provider: 'stripe', createdBefore: before }));
    expect(q.sql).toMatch(/"payment"\."provider" = \$1/);
    expect(q.sql).toMatch(/"payment"\."provider_payment_id" is not null/);
    expect(q.sql).toMatch(/"payment"\."fee_reconciled_at" is null/);
    expect(q.sql).toMatch(/"payment"\."status" in \(\$2, \$3, \$4, \$5, \$6\)/);
    expect(q.sql).toMatch(/"payment"\."created_at" < \$7/);
    expect(q.params).toEqual(['stripe', ...FEE_RECONCILABLE_STATUSES, before.toISOString()]);
    // Sin provider_fee_actual en la condición: entran los que no la tienen y los que la tienen sin marca (backfill).
    expect(q.sql).not.toMatch(/provider_fee_actual/);
  });

  it('[H2-SQL-02] la marca se escribe en la misma actualización solo si viene en el cambio', () => {
    const at = new Date('2026-11-16T12:00:00Z');
    expect(toPaymentUpdate({ updatedAt: at, feeReconciledAt: at })).toEqual({ updatedAt: at, feeReconciledAt: at });
    expect(toPaymentUpdate({ updatedAt: at })).not.toHaveProperty('feeReconciledAt');
  });
});
