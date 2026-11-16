import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { IncomingHttpHeaders } from 'http';
import { AuthModule } from '../../../auth/auth.module';
import { SESSION_PROVIDER, type AuthSession, type SessionProvider } from '../../../auth/ports/session-provider';
import { ACTOR_PROFILE_READER, type ActorProfile, type ActorProfileReader } from '../../../auth/ports/actor-profile-reader';
import { DomainExceptionFilter } from '../../../common/filters/domain-exception.filter';
import { createValidationPipe } from '../../../common/validation/create-validation-pipe';
import { money } from '../domain/money';
import { RefundApprovalError, RefundExceedsAvailableError, RefundNotFoundError } from '../application/refunds.errors';
import { ADMIN_REFUND_AUDIT_ACTIONS, AdminRefundsService } from '../application/use-cases/admin-refunds.service';
import { REFUND_CREATE_SCOPE, type RefundView } from '../application/use-cases/refunds.use-cases';
import { AdminRefundsController } from './admin-refunds.controller';

// H-7 (sin BD ni proveedor): rutas administrativas de reembolsos por HTTP, con la cadena real SessionGuard → RolesGuard,
// el filtro y el pipe globales, y RefundsUseCases sustituido por un doble.
const SESSION_HEADER = 'x-test-session';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const PAYMENT = '22222222-2222-4222-8222-222222222222';
const REFUND = '33333333-3333-4333-8333-333333333333';

class FakeSessionProvider implements SessionProvider {
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const userId = headers[SESSION_HEADER];
    if (typeof userId !== 'string') return null;
    return {
      user: { id: userId, email: `${userId}@h7.test`, name: userId, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id: `session-${userId}`, expiresAt: new Date(Date.now() + 3_600_000) },
    };
  }
}
const PROFILES: Record<string, ActorProfile> = {
  'user-admin': { userProfileId: ADMIN, role: 'admin' },
  'user-patient': { userProfileId: '44444444-4444-4444-8444-444444444444', role: 'patient' },
  'user-doctor': { userProfileId: '55555555-5555-4555-8555-555555555555', role: 'doctor' },
};
class FakeActorProfileReader implements ActorProfileReader {
  async findByUserId(userId: string) {
    return PROFILES[userId] ?? null;
  }
}

const view = (over: Partial<RefundView> = {}): RefundView => ({
  refundId: REFUND, paymentId: PAYMENT, status: 'processing', amount: '200.00', reason: 'exceptional_refund', peiFeeShare: '20.00', doctorShare: '180.00',
  providerRefundId: 're_test', providerStatus: 'pending', approvedBy: null, awaitingApproval: false, processedAt: null, failureReason: null, ...over,
});

describe('Reembolsos administrativos por HTTP (H-7)', () => {
  let app: INestApplication;
  const refunds = {
    requestRefund: jest.fn(),
    approveRefund: jest.fn(),
    rejectRefund: jest.fn(),
    refundsForPayment: jest.fn(),
    getRefund: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const as = (user: string) => ({ [SESSION_HEADER]: user });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [AdminRefundsController],
      providers: [{ provide: AdminRefundsService, useFactory: () => new AdminRefundsService({ refunds: refunds as never, audit, uow: { runInTransaction: (work: () => Promise<unknown>) => work() } as never }) }],
    })
      .overrideProvider(SESSION_PROVIDER).useClass(FakeSessionProvider)
      .overrideProvider(ACTOR_PROFILE_READER).useClass(FakeActorProfileReader)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    for (const f of [...Object.values(refunds), audit.record]) f.mockReset();
    refunds.getRefund.mockResolvedValue(view({ status: 'requested', approvedBy: null, awaitingApproval: true }));
  });

  it('[H7-HTTP-01] solo el rol admin: sin sesión 401; paciente y médico 403', async () => {
    await request(app.getHttpServer()).get(`/admin/payments/${PAYMENT}/refunds`).expect(401);
    for (const user of ['user-patient', 'user-doctor']) {
      await request(app.getHttpServer()).get(`/admin/payments/${PAYMENT}/refunds`).set(as(user)).expect(403);
      await request(app.getHttpServer()).post(`/admin/payments/${PAYMENT}/refunds`).set(as(user)).set('Idempotency-Key', 'k').send({ kind: 'full', reason: 'other' }).expect(403);
      await request(app.getHttpServer()).post(`/admin/refunds/${REFUND}/approve`).set(as(user)).expect(403);
      await request(app.getHttpServer()).post(`/admin/refunds/${REFUND}/reject`).set(as(user)).send({ reason: 'no procede' }).expect(403);
    }
    expect(refunds.requestRefund).not.toHaveBeenCalled();
  });

  it('[H7-HTTP-02] total: usa el motor existente con la clave, el alcance refund.create y el administrador de la sesión; audita la creación', async () => {
    refunds.requestRefund.mockResolvedValue({ outcome: 'created', refund: view(), action: 'submitted' });
    const res = await request(app.getHttpServer()).post(`/admin/payments/${PAYMENT}/refunds`).set(as('user-admin')).set('Idempotency-Key', 'clave-1')
      .send({ kind: 'full', reason: 'exceptional_refund', notes: 'nota' }).expect(200);
    expect(res.body).toMatchObject({ outcome: 'created', action: 'submitted', refund: { refundId: REFUND, peiFeeShare: '20.00', doctorShare: '180.00' } });
    expect(refunds.requestRefund).toHaveBeenCalledWith({
      scope: REFUND_CREATE_SCOPE, key: 'clave-1', paymentId: PAYMENT, amount: { kind: 'full' }, reason: 'exceptional_refund',
      requestedBy: { type: 'admin', userProfileId: ADMIN }, notes: 'nota',
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: ADMIN_REFUND_AUDIT_ACTIONS.requested, entityType: 'refund', entityId: REFUND, actor: { type: 'user', userProfileId: ADMIN } });
  });

  it('[H7-HTTP-03] parcial: importe en centavos, sin aprobación en la misma llamada; una repetición (existing) no se vuelve a auditar', async () => {
    refunds.requestRefund.mockResolvedValue({ outcome: 'existing', refund: view({ status: 'requested', amount: '50.00', awaitingApproval: true }), action: 'awaiting_approval' });
    await request(app.getHttpServer()).post(`/admin/payments/${PAYMENT}/refunds`).set(as('user-admin')).set('Idempotency-Key', 'clave-2')
      .send({ kind: 'partial', amount: '50.5', reason: 'other' }).expect(200);
    const input = refunds.requestRefund.mock.calls[0][0];
    expect(input.amount).toEqual({ kind: 'partial', amount: money(5_050) });
    expect(input).not.toHaveProperty('approvedBy');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['sin Idempotency-Key', {}, { kind: 'full', reason: 'other' }],
    ['total con importe', { 'Idempotency-Key': 'k' }, { kind: 'full', amount: '10.00', reason: 'other' }],
    ['parcial sin importe', { 'Idempotency-Key': 'k' }, { kind: 'partial', reason: 'other' }],
    ['importe con tres decimales', { 'Idempotency-Key': 'k' }, { kind: 'partial', amount: '10.001', reason: 'other' }],
    ['importe negativo', { 'Idempotency-Key': 'k' }, { kind: 'partial', amount: '-10', reason: 'other' }],
    ['motivo de cancelación de M08', { 'Idempotency-Key': 'k' }, { kind: 'full', reason: 'patient_cancellation' }],
    ['motivo de cancelación administrativa (fuera de H-7)', { 'Idempotency-Key': 'k' }, { kind: 'full', reason: 'admin_cancellation' }],
    ['aprobación en el cuerpo', { 'Idempotency-Key': 'k' }, { kind: 'partial', amount: '10', reason: 'other', approvedBy: ADMIN }],
    ['prorrata en el cuerpo', { 'Idempotency-Key': 'k' }, { kind: 'partial', amount: '10', reason: 'other', doctorShare: '9' }],
  ])('[H7-HTTP-04] solicitud inválida: %s → 400 sin llamar al motor', async (_label, headers, body) => {
    await request(app.getHttpServer()).post(`/admin/payments/${PAYMENT}/refunds`).set(as('user-admin')).set(headers as Record<string, string>).send(body).expect(400);
    expect(refunds.requestRefund).not.toHaveBeenCalled();
  });

  it('[H7-HTTP-05] reglas del motor → HTTP: importe por encima del disponible 422; pago o reembolso inexistente 404', async () => {
    refunds.requestRefund.mockRejectedValue(new RefundExceedsAvailableError('150.00'));
    await request(app.getHttpServer()).post(`/admin/payments/${PAYMENT}/refunds`).set(as('user-admin')).set('Idempotency-Key', 'k')
      .send({ kind: 'partial', amount: '300', reason: 'other' }).expect(422);
    refunds.approveRefund.mockRejectedValue(new RefundNotFoundError());
    await request(app.getHttpServer()).post(`/admin/refunds/${REFUND}/approve`).set(as('user-admin')).expect(404);
    refunds.approveRefund.mockRejectedValue(new RefundApprovalError('not_partial'));
    await request(app.getHttpServer()).post(`/admin/refunds/${REFUND}/approve`).set(as('user-admin')).expect(422);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('[H7-HTTP-06] aprobar: el aprobador es el administrador de la sesión y queda auditado', async () => {
    refunds.approveRefund.mockResolvedValue({ refund: view({ approvedBy: ADMIN }), action: 'submitted' });
    await request(app.getHttpServer()).post(`/admin/refunds/${REFUND}/approve`).set(as('user-admin')).expect(200);
    expect(refunds.approveRefund).toHaveBeenCalledWith(REFUND, ADMIN);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: ADMIN_REFUND_AUDIT_ACTIONS.approved, entityId: REFUND, actor: { userProfileId: ADMIN } });
  });

  it('[H7-HTTP-07] rechazar: motivo obligatorio; el administrador queda en audit_log (refund no tiene columna de rechazo)', async () => {
    await request(app.getHttpServer()).post(`/admin/refunds/${REFUND}/reject`).set(as('user-admin')).send({}).expect(400);
    refunds.rejectRefund.mockResolvedValue({ refund: view({ status: 'canceled' }), action: 'terminal' });
    await request(app.getHttpServer()).post(`/admin/refunds/${REFUND}/reject`).set(as('user-admin')).send({ reason: 'no procede' }).expect(200);
    expect(refunds.rejectRefund).toHaveBeenCalledWith(REFUND, 'no procede');
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: ADMIN_REFUND_AUDIT_ACTIONS.rejected, entityId: REFUND, actor: { userProfileId: ADMIN } });
  });

  it('[H7-HTTP-08] consulta: reembolsos del pago y conciliación con importes como texto decimal', async () => {
    refunds.refundsForPayment.mockResolvedValue({
      refunds: [view()],
      reconciliation: { gross: money(20_000), refundedSucceeded: money(0), refundedInFlight: money(20_000), providerFeeActual: money(1_299), providerFeeReturned: null, netReceived: money(18_701), netAfterRefunds: null },
    });
    const res = await request(app.getHttpServer()).get(`/admin/payments/${PAYMENT}/refunds`).set(as('user-admin')).expect(200);
    expect(res.body.reconciliation).toEqual({ gross: '200.00', refundedSucceeded: '0.00', refundedInFlight: '200.00', providerFeeActual: '12.99', providerFeeReturned: null, netReceived: '187.01', netAfterRefunds: null });
    expect(res.body.refunds).toHaveLength(1);
    await request(app.getHttpServer()).get('/admin/payments/no-es-uuid/refunds').set(as('user-admin')).expect(400);
  });
});
