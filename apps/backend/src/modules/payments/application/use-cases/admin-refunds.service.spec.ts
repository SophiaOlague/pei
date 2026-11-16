import { transactionStorage } from '../../../../db/transaction-context';
import { DrizzleAuditTrail } from '../../../audit/infrastructure/drizzle-audit-trail';
import { AuditOutsideTransactionError } from '../../../audit/domain/audit.errors';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { AuditEvent } from '../../../audit/domain/audit-event';
import type { Actor } from '../../../../common/application/actor';
import { money } from '../../domain/money';
import { RefundApprovalError, RefundExceedsAvailableError, RefundNotFoundError } from '../refunds.errors';
import { ADMIN_REFUND_AUDIT_ACTIONS, AdminRefundsService } from './admin-refunds.service';
import { REFUND_CREATE_SCOPE, type RefundView } from './refunds.use-cases';

// H-7, escenario 1 (corrección): la auditoría se registra con el DrizzleAuditTrail REAL, que, como en producción,
// rechaza cualquier escritura fuera de una UnitOfWork (D6). La UnitOfWork de la prueba abre una transacción "ambiental"
// falsa (transactionStorage) que captura las filas de audit_log. Sin BD.
const ADMIN_PROFILE = '11111111-1111-4111-8111-111111111111';
const ADMIN: Actor = { userId: 'user-admin', userProfileId: ADMIN_PROFILE, role: 'admin', ipAddress: '203.0.113.9', userAgent: 'h7-spec' } as Actor;
const PAYMENT = '22222222-2222-4222-8222-222222222222';
const REFUND = '33333333-3333-4333-8333-333333333333';
const view = (over: Partial<RefundView> = {}): RefundView => ({
  refundId: REFUND, paymentId: PAYMENT, status: 'succeeded', amount: '200.00', reason: 'exceptional_refund', peiFeeShare: '20.00', doctorShare: '180.00',
  providerRefundId: 're_test', providerStatus: 'succeeded', approvedBy: null, awaitingApproval: false, processedAt: null, failureReason: null, ...over,
});

function world() {
  const rows: Record<string, unknown>[] = [];
  const order: string[] = [];
  let insideTx = 0;
  const tx = { insert: () => ({ values: async (row: Record<string, unknown>) => { order.push('audit-insert'); rows.push(row); } }) };
  const uow = {
    runInTransaction: async <T>(work: () => Promise<T>) => {
      order.push('tx-begin');
      insideTx += 1;
      try {
        return await transactionStorage.run(tx as never, work);
      } finally {
        insideTx -= 1;
        order.push('tx-end');
      }
    },
  };
  const refunds = {
    // El motor (y su llamada a Stripe) se ejecuta FUERA de la transacción de auditoría.
    requestRefund: jest.fn(async () => { order.push(`engine(insideTx=${insideTx})`); return { outcome: 'created' as const, refund: view(), action: 'submitted' as const }; }),
    approveRefund: jest.fn(async () => { order.push(`engine(insideTx=${insideTx})`); return { refund: view({ approvedBy: ADMIN_PROFILE }), action: 'submitted' as const }; }),
    rejectRefund: jest.fn(async () => { order.push(`engine(insideTx=${insideTx})`); return { refund: view({ status: 'canceled' }), action: 'terminal' as const }; }),
    refundsForPayment: jest.fn(),
    getRefund: jest.fn(async () => view({ status: 'requested', approvedBy: null, awaitingApproval: true })),
  };
  const service = new AdminRefundsService({ refunds: refunds as never, audit: new DrizzleAuditTrail(), uow: uow as never });
  return { service, refunds, rows, order };
}

describe('AdminRefundsService · auditoría dentro de una UnitOfWork (corrección H-7 escenario 1)', () => {
  it('[H7-AUD-00] el DrizzleAuditTrail real rechaza escribir fuera de una transacción (la causa del 500)', async () => {
    const event = AuditEvent.create({ actor: AuditActor.fromActor(ADMIN), action: ADMIN_REFUND_AUDIT_ACTIONS.requested, entity: { type: 'refund', id: REFUND } });
    await expect(new DrizzleAuditTrail().record(event)).rejects.toBeInstanceOf(AuditOutsideTransactionError);
  });

  it('[H7-AUD-01] solicitud: el motor corre fuera de la transacción y la auditoría dentro; conserva el administrador y la acción', async () => {
    const w = world();
    const result = await w.service.request(ADMIN, { paymentId: PAYMENT, idempotencyKey: 'clave', amount: { kind: 'full' }, reason: 'exceptional_refund' });
    expect(result.outcome).toBe('created');
    expect(w.order).toEqual(['engine(insideTx=0)', 'tx-begin', 'audit-insert', 'tx-end']);
    expect(w.rows).toEqual([expect.objectContaining({
      action: 'payments.refund.requested_by_admin', entityType: 'refund', entityId: REFUND, actorType: 'user', actorUserId: 'user-admin', actorUserProfileId: ADMIN_PROFILE,
    })]);
    expect(w.rows[0].metadata).toMatchObject({ paymentId: PAYMENT, kind: 'full', amount: '200.00', reason: 'exceptional_refund' });
    expect(w.refunds.requestRefund).toHaveBeenCalledWith(expect.objectContaining({ scope: REFUND_CREATE_SCOPE, key: 'clave', requestedBy: { type: 'admin', userProfileId: ADMIN_PROFILE } }));
  });

  it('[H7-AUD-02] idempotencia: una repetición (existing) no reenvía nada ni vuelve a auditar', async () => {
    const w = world();
    w.refunds.requestRefund.mockResolvedValueOnce({ outcome: 'existing', refund: view(), action: 'terminal' } as never);
    expect((await w.service.request(ADMIN, { paymentId: PAYMENT, idempotencyKey: 'clave', amount: { kind: 'full' }, reason: 'other' })).outcome).toBe('existing');
    expect(w.rows).toEqual([]);
    expect(w.order).toEqual([]);
  });

  it('[H7-AUD-03] aprobar y rechazar: auditados dentro de su transacción con el administrador de la sesión', async () => {
    const w = world();
    await w.service.approve(ADMIN, REFUND);
    await w.service.reject(ADMIN, REFUND, 'no procede');
    expect(w.refunds.approveRefund).toHaveBeenCalledWith(REFUND, ADMIN_PROFILE);
    expect(w.rows.map((r) => [r.action, r.actorUserProfileId])).toEqual([
      ['payments.refund.approved', ADMIN_PROFILE],
      ['payments.refund.rejected', ADMIN_PROFILE],
    ]);
    expect(w.order.filter((o) => o.startsWith('engine'))).toEqual(['engine(insideTx=0)', 'engine(insideTx=0)']);
  });

  it('[H7-AUD-04] errores: un rechazo del motor no audita; un fallo al auditar se propaga (no se oculta) sin repetir el motor', async () => {
    const w = world();
    w.refunds.requestRefund.mockRejectedValueOnce(new RefundExceedsAvailableError('0.00'));
    await expect(w.service.request(ADMIN, { paymentId: PAYMENT, idempotencyKey: 'k', amount: { kind: 'partial', amount: money(100) }, reason: 'other' })).rejects.toBeInstanceOf(RefundExceedsAvailableError);
    expect(w.rows).toEqual([]);

    const failing = world();
    const broken = new AdminRefundsService({
      refunds: failing.refunds as never,
      audit: { record: async () => { throw new Error('fallo de BD al auditar'); } },
      uow: { runInTransaction: async <T>(work: () => Promise<T>) => work() } as never,
    });
    await expect(broken.request(ADMIN, { paymentId: PAYMENT, idempotencyKey: 'k2', amount: { kind: 'full' }, reason: 'other' })).rejects.toThrow('fallo de BD al auditar');
    expect(failing.refunds.requestRefund).toHaveBeenCalledTimes(1);
  });
});

// Aprobaciones repetidas (H-7 escenario 2): el motor es idempotente; solo la transición real se audita.
describe('AdminRefundsService · aprobación auditada solo en la transición real', () => {
  const OTHER_ADMIN = '66666666-6666-4666-8666-666666666666';
  // Motor con estado: la primera aprobación fija approved_by y "envía" a Stripe; repetirla con el mismo administrador
  // no envía nada (como RefundsUseCases.approveRefund + advance sobre un reembolso ya terminado).
  function statefulWorld() {
    const base = world();
    const state = { approvedBy: null as string | null, submissions: 0 };
    base.refunds.getRefund.mockImplementation(async () => view({ status: state.approvedBy ? 'succeeded' : 'requested', approvedBy: state.approvedBy, awaitingApproval: !state.approvedBy }));
    (base.refunds.approveRefund as jest.Mock).mockImplementation(async (_id: string, approver: string) => {
      if (state.approvedBy === null) {
        state.approvedBy = approver;
        state.submissions += 1;
        return { refund: view({ approvedBy: approver }), action: 'submitted' as const };
      }
      if (state.approvedBy !== approver) throw new RefundApprovalError('not_awaiting_approval');
      return { refund: view({ approvedBy: state.approvedBy }), action: 'terminal' as const };
    });
    return { ...base, state };
  }
  const approvals = (rows: Record<string, unknown>[]) => rows.filter((r) => r.action === ADMIN_REFUND_AUDIT_ACTIONS.approved);

  it('[H7-APR-01] primera aprobación: exactamente una entrada de auditoría, con el administrador correcto', async () => {
    const w = statefulWorld();
    const r = await w.service.approve(ADMIN, REFUND);
    expect(r.action).toBe('submitted');
    expect(approvals(w.rows)).toEqual([expect.objectContaining({ entityId: REFUND, actorUserProfileId: ADMIN_PROFILE, actorUserId: 'user-admin' })]);
    expect(w.refunds.approveRefund).toHaveBeenCalledWith(REFUND, ADMIN_PROFILE);
  });

  it('[H7-APR-02/03] segunda aprobación: responde igual (idempotente), no audita otra vez y no reenvía a Stripe', async () => {
    const w = statefulWorld();
    await w.service.approve(ADMIN, REFUND);
    const second = await w.service.approve(ADMIN, REFUND);
    expect(second.refund.approvedBy).toBe(ADMIN_PROFILE);
    expect(approvals(w.rows)).toHaveLength(1);
    expect(w.state.submissions).toBe(1);
  });

  it('[H7-APR-04] otro administrador sobre un reembolso ya aprobado: el motor lo rechaza y no hay auditoría', async () => {
    const w = statefulWorld();
    await w.service.approve(ADMIN, REFUND);
    await expect(w.service.approve({ ...ADMIN, userId: 'user-admin-2', userProfileId: OTHER_ADMIN } as Actor, REFUND)).rejects.toBeInstanceOf(RefundApprovalError);
    expect(approvals(w.rows)).toHaveLength(1);
    expect(w.state.approvedBy).toBe(ADMIN_PROFILE);
  });

  it('[H7-APR-05] errores del motor (inexistente, no parcial): sin auditoría de aprobación', async () => {
    const w = statefulWorld();
    w.refunds.getRefund.mockRejectedValueOnce(new RefundNotFoundError());
    await expect(w.service.approve(ADMIN, REFUND)).rejects.toBeInstanceOf(RefundNotFoundError);
    w.refunds.approveRefund.mockRejectedValueOnce(new RefundApprovalError('not_partial'));
    await expect(w.service.approve(ADMIN, REFUND)).rejects.toBeInstanceOf(RefundApprovalError);
    expect(approvals(w.rows)).toEqual([]);
    expect(w.state.submissions).toBe(0);
  });
});
