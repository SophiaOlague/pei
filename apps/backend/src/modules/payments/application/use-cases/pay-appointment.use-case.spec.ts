import type { ConfirmationResult } from '../../../appointments/application/integration/appointment-integration.services';
import { money } from '../../domain/money';
import type { AppointmentForPayment } from '../ports/appointment-payment.reader';
import type { IdempotencyKeyRecord, PaymentRecord } from '../ports/payments.repositories';
import {
  AppointmentNotFoundForPaymentError,
  AppointmentNotPayableError,
  AppointmentPatientMismatchError,
  PayAppointmentUseCase,
  type PayAppointmentInput,
} from './pay-appointment.use-case';
import { PaymentAppointmentMismatchError } from './payment-appointment-identity';
import type { CreateConsultationPaymentInput, CreatePaymentResult, PaymentsUseCases, PaymentView } from './payments.use-cases';

// F3.1 con dobles: sin base de datos, sin Mercado Pago y sin M08 real (confirmPaid es un doble con su contrato).
const NOW = new Date('2026-11-11T12:00:00Z');
const PAYMENT_ID = '00000000-0000-4000-8000-000000000001';
const CARD = { token: 'tok_brick', paymentMethodId: 'visa', installments: 1, payerEmail: 'paciente@example.com' };
const INPUT: PayAppointmentInput = { idempotencyKey: 'clave-idempotencia-0001', patientId: 'pat-1', appointmentId: 'apt-1', card: CARD };
const APPOINTMENT: AppointmentForPayment = {
  appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: 'pending_payment', price: money(65_000),
  paymentHoldExpiresAt: new Date(NOW.getTime() + 3 * 60_000),
};

const view = (status: PaymentView['status'], over: Partial<PaymentView> = {}): PaymentView => ({
  paymentId: PAYMENT_ID, type: 'consultation', status, captured: ['succeeded', 'partially_refunded', 'refunded', 'in_dispute', 'charged_back'].includes(status),
  providerPaymentId: status === 'pending' ? null : '987', providerStatus: null, gross: '650.00', peiFixedFee: '100.00', doctorNet: '550.00',
  providerFeeEstimated: '28.69', providerFeeActual: null, netReceived: null, moneyReleaseDate: null, ...over,
});

function setup(opts: {
  appointment?: AppointmentForPayment | null;
  created?: CreatePaymentResult | Error;
  confirm?: ConfirmationResult | Error;
  key?: IdempotencyKeyRecord | null;
  record?: Partial<PaymentRecord> | null;
} = {}) {
  const createCalls: CreateConsultationPaymentInput[] = [];
  const confirmCalls: [string, string, string][] = [];
  const created = opts.created ?? { payment: view('succeeded'), recoverable: false };
  const uc = new PayAppointmentUseCase({
    clock: { now: () => NOW },
    appointments: { findForPayment: async () => (opts.appointment === undefined ? APPOINTMENT : opts.appointment) },
    payments: {
      createConsultationPayment: async (i: CreateConsultationPaymentInput) => {
        createCalls.push(i);
        if (created instanceof Error) throw created;
        return created;
      },
    } as unknown as PaymentsUseCases,
    keys: { find: async () => opts.key ?? null, insert: async () => undefined, complete: async () => undefined },
    paymentRecords: {
      // Registro persistido coherente con la cita (el paso compartido de confirmación valida su identidad).
      findById: async () => (opts.record === null ? null : ({
        id: PAYMENT_ID, type: 'consultation', appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: 'succeeded', gross: money(65_000), ...opts.record,
      } as PaymentRecord)),
      insert: async () => undefined,
      update: async () => undefined,
    },
    confirmation: {
      confirmPaid: async (appointmentId: string, paymentId: string, amount: string) => {
        confirmCalls.push([appointmentId, paymentId, amount]);
        const c = opts.confirm ?? { result: 'confirmed' };
        if (c instanceof Error) throw c;
        return c;
      },
    },
  });
  return { uc, createCalls, confirmCalls };
}
const KEY: IdempotencyKeyRecord = { scope: 'payment.create', key: INPUT.idempotencyKey, requestHash: 'h', paymentId: PAYMENT_ID, createdAt: NOW, completedAt: NOW };

describe('PayAppointmentUseCase · validaciones previas (no se cobra)', () => {
  it.each([
    ['cita inexistente', { appointment: null }, AppointmentNotFoundForPaymentError],
    ['paciente distinto (CC-4)', { appointment: { ...APPOINTMENT, patientId: 'otro' } }, AppointmentPatientMismatchError],
    ['estado confirmed', { appointment: { ...APPOINTMENT, status: 'confirmed' } }, AppointmentNotPayableError],
    ['estado expired', { appointment: { ...APPOINTMENT, status: 'expired' } }, AppointmentNotPayableError],
    ['estado canceled', { appointment: { ...APPOINTMENT, status: 'canceled' } }, AppointmentNotPayableError],
    ['retención vencida', { appointment: { ...APPOINTMENT, paymentHoldExpiresAt: new Date(NOW.getTime() - 1) } }, AppointmentNotPayableError],
    ['retención exactamente en el límite', { appointment: { ...APPOINTMENT, paymentHoldExpiresAt: NOW } }, AppointmentNotPayableError],
    ['sin retención', { appointment: { ...APPOINTMENT, paymentHoldExpiresAt: null } }, AppointmentNotPayableError],
  ])('%s', async (_n, opts, error) => {
    const s = setup(opts as Parameters<typeof setup>[0]);
    await expect(s.uc.execute(INPUT)).rejects.toThrow(error);
    expect(s.createCalls).toEqual([]);
    expect(s.confirmCalls).toEqual([]);
  });

  it('CC-4 se comprueba antes de cualquier otra cosa, también en un reintento con pago capturado', async () => {
    const s = setup({ appointment: { ...APPOINTMENT, patientId: 'otro', status: 'confirmed' }, key: KEY, record: {} });
    await expect(s.uc.execute(INPUT)).rejects.toThrow(AppointmentPatientMismatchError);
    expect(s.createCalls).toEqual([]);
  });

  it('el motivo de la retención vencida es explícito', async () => {
    const e = await setup({ appointment: { ...APPOINTMENT, paymentHoldExpiresAt: null } }).uc.execute(INPUT).then(
      () => { throw new Error('se esperaba un error'); },
      (x: unknown) => x as AppointmentNotPayableError,
    );
    expect(e.details).toEqual({ reason: 'hold_expired' });
  });
});

describe('PayAppointmentUseCase · cobro y confirmación', () => {
  it('el importe sale de appointment.price y el pago succeeded llama a confirmPaid con ese importe', async () => {
    const s = setup();
    const r = await s.uc.execute(INPUT);
    expect(s.createCalls).toEqual([{ idempotencyKey: INPUT.idempotencyKey, patientId: 'pat-1', doctorId: 'doc-1', appointmentId: 'apt-1', gross: money(65_000), card: CARD }]);
    expect(s.confirmCalls).toEqual([['apt-1', PAYMENT_ID, '650.00']]);
    expect(r).toMatchObject({ confirmation: { result: 'confirmed' }, appointmentConfirmed: true, recoverable: false });
  });

  it('already_confirmed es una confirmación satisfactoria', async () => {
    const r = await setup({ confirm: { result: 'already_confirmed' } }).uc.execute(INPUT);
    expect(r).toMatchObject({ confirmation: { result: 'already_confirmed' }, appointmentConfirmed: true });
  });

  it.each(['expired', 'amount_mismatch', 'invalid_state'] as const)('not_confirmable (%s) se devuelve explícitamente y el pago se conserva', async (reason) => {
    const r = await setup({ confirm: { result: 'not_confirmable', reason } }).uc.execute(INPUT);
    expect(r).toMatchObject({ confirmation: { result: 'not_confirmable', reason }, appointmentConfirmed: false, payment: { status: 'succeeded' } });
  });

  it.each([
    ['rechazado (failed)', { payment: view('failed'), recoverable: false, providerError: 'rejected_request' as const }],
    ['processing (p. ej. authorized)', { payment: view('processing', { providerStatus: 'authorized/pending_capture' }), recoverable: false }],
    ['pendiente recuperable', { payment: view('pending'), recoverable: true, providerError: 'timeout' as const }],
  ])('pago %s: no se confirma la cita', async (_n, created) => {
    const s = setup({ created });
    const r = await s.uc.execute(INPUT);
    expect(s.confirmCalls).toEqual([]);
    expect(r).toMatchObject({ confirmation: { result: 'not_requested' }, appointmentConfirmed: false, recoverable: created.recoverable });
  });

  it('un error del flujo de creación se propaga sin confirmar', async () => {
    const s = setup({ created: new Error('fallo') });
    await expect(s.uc.execute(INPUT)).rejects.toThrow('fallo');
    expect(s.confirmCalls).toEqual([]);
  });
});

describe('PayAppointmentUseCase · identidad del pago persistido (regla compartida)', () => {
  it.each([
    ['otro médico', { doctorId: 'otro-medico' }, 'doctor'],
    ['otro paciente', { patientId: 'otro-paciente' }, 'patient'],
    ['otra cita', { appointmentId: 'apt-otra' }, 'appointment'],
  ] as const)('el pago registrado es de %s: no se confirma', async (_n, record, party) => {
    const s = setup({ record });
    const e = await s.uc.execute(INPUT).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(PaymentAppointmentMismatchError);
    expect((e as PaymentAppointmentMismatchError).party).toBe(party);
    expect(s.confirmCalls).toEqual([]);
  });
});

describe('PayAppointmentUseCase · recuperación', () => {
  it('si confirmPaid falla, el pago sigue succeeded, la cita no se da por confirmada y es recuperable', async () => {
    const r = await setup({ confirm: new Error('conexión perdida') }).uc.execute(INPUT);
    expect(r).toMatchObject({ payment: { status: 'succeeded' }, confirmation: { result: 'confirmation_failed' }, appointmentConfirmed: false, recoverable: true });
  });

  it('reintento con la misma clave y pago ya capturado: no exige la retención y solo reconfirma', async () => {
    // La cita ya no está en pending_payment y la retención venció, pero el pago de esta clave ya es succeeded.
    const s = setup({ appointment: { ...APPOINTMENT, status: 'confirmed', paymentHoldExpiresAt: null }, key: KEY, record: {}, confirm: { result: 'already_confirmed' } });
    const r = await s.uc.execute(INPUT);
    // El flujo de creación con la misma clave devuelve el pago existente sin llamar al proveedor (segunda entrega).
    expect(s.createCalls).toHaveLength(1);
    expect(s.createCalls[0].idempotencyKey).toBe(INPUT.idempotencyKey);
    expect(s.confirmCalls).toEqual([['apt-1', PAYMENT_ID, '650.00']]);
    expect(r).toMatchObject({ appointmentConfirmed: true, confirmation: { result: 'already_confirmed' } });
  });

  it('un reintento cuyo pago NO está capturado vuelve a exigir el estado y la retención', async () => {
    const s = setup({ appointment: { ...APPOINTMENT, status: 'expired' }, key: KEY, record: { status: 'pending' } });
    await expect(s.uc.execute(INPUT)).rejects.toThrow(AppointmentNotPayableError);
    expect(s.createCalls).toEqual([]);
  });

  it('una clave cuyo pago es de otra cita no se trata como reintento', async () => {
    const s = setup({ appointment: { ...APPOINTMENT, status: 'confirmed' }, key: KEY, record: { appointmentId: 'apt-otra' } });
    await expect(s.uc.execute(INPUT)).rejects.toThrow(AppointmentNotPayableError);
    expect(s.createCalls).toEqual([]);
  });
});
