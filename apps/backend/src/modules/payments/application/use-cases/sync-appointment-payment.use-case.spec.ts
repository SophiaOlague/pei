import type { ConfirmationResult } from '../../../appointments/application/integration/appointment-integration.services';
import { money } from '../../domain/money';
import type { AppointmentForPayment } from '../ports/appointment-payment.reader';
import type { PaymentRecord } from '../ports/payments.repositories';
import { PaymentNotFoundError } from '../payments-use-case.errors';
import { AppointmentNotFoundForPaymentError, AppointmentPatientMismatchError } from './pay-appointment.use-case';
import type { PaymentsUseCases, PaymentView } from './payments.use-cases';
import { NotAnAppointmentPaymentError, SyncAppointmentPaymentUseCase } from './sync-appointment-payment.use-case';
import { PaymentAppointmentMismatchError } from './payment-appointment-identity';

// F3.2 con dobles: sin base de datos, sin Mercado Pago y sin M08 real.
const PAYMENT_ID = '00000000-0000-4000-8000-000000000001';
// Identidad completa del pago (el paso compartido de confirmación compara cita, paciente y médico, y usa el bruto).
const RECORD = { id: PAYMENT_ID, type: 'consultation', patientId: 'pat-1', doctorId: 'doc-1', appointmentId: 'apt-1', status: 'processing', gross: money(65_000) } as PaymentRecord;
const APPOINTMENT: AppointmentForPayment = { appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: 'pending_payment', price: money(65_000), paymentHoldExpiresAt: null };
const view = (status: PaymentView['status'], over: Partial<PaymentView> = {}): PaymentView => ({
  paymentId: PAYMENT_ID, type: 'consultation', status, captured: status === 'succeeded', providerPaymentId: '987', providerStatus: status,
  gross: '650.00', peiFixedFee: '100.00', doctorNet: '550.00', providerFeeEstimated: '28.69', providerFeeActual: null, netReceived: null, moneyReleaseDate: null, ...over,
});

function setup(opts: { record?: PaymentRecord | null; synced?: PaymentView | Error; appointment?: AppointmentForPayment | null; confirm?: (ConfirmationResult | Error)[] } = {}) {
  const calls = { getPayment: [] as [string, unknown][], create: 0, confirm: [] as [string, string, string][] };
  const confirmQueue = [...(opts.confirm ?? [{ result: 'confirmed' as const }])];
  const uc = new SyncAppointmentPaymentUseCase({
    paymentRecords: { findById: async () => (opts.record === undefined ? RECORD : opts.record), insert: async () => undefined, update: async () => undefined },
    payments: {
      getPayment: async (id: string, o: unknown) => {
        calls.getPayment.push([id, o]);
        const s = opts.synced ?? view('succeeded');
        if (s instanceof Error) throw s;
        return s;
      },
      createConsultationPayment: async () => {
        calls.create += 1;
        throw new Error('la sincronización nunca cobra');
      },
    } as unknown as PaymentsUseCases,
    appointments: { findForPayment: async () => (opts.appointment === undefined ? APPOINTMENT : opts.appointment) },
    confirmation: {
      confirmPaid: async (a: string, p: string, amount: string) => {
        calls.confirm.push([a, p, amount]);
        const next = confirmQueue.shift() ?? { result: 'already_confirmed' as const };
        if (next instanceof Error) throw next;
        return next;
      },
    },
  });
  return { uc, calls };
}

describe('SyncAppointmentPaymentUseCase · estados del proveedor', () => {
  it.each([
    ['pending', view('pending', { providerPaymentId: null })],
    ['processing', view('processing')],
    ['processing por authorized', view('processing', { providerStatus: 'authorized/pending_capture' })],
    ['failed', view('failed')],
  ])('pago que queda %s: no se confirma ni se cobra', async (_n, synced) => {
    const s = setup({ synced });
    const r = await s.uc.execute({ paymentId: PAYMENT_ID });
    expect(r).toMatchObject({ confirmation: { result: 'not_requested' }, appointmentConfirmed: false });
    expect(s.calls.confirm).toEqual([]);
    expect(s.calls.create).toBe(0);
  });

  it('consulta el estado real con refresh (sin cobrar) y, de processing a succeeded, confirma la cita', async () => {
    const s = setup();
    const r = await s.uc.execute({ paymentId: PAYMENT_ID });
    expect(s.calls.getPayment).toEqual([[PAYMENT_ID, { refresh: true }]]);
    expect(s.calls.confirm).toEqual([['apt-1', PAYMENT_ID, '650.00']]);
    expect(s.calls.create).toBe(0);
    expect(r).toMatchObject({ confirmation: { result: 'confirmed' }, appointmentConfirmed: true, payment: { status: 'succeeded' } });
  });

  it('already_confirmed es satisfactorio', async () => {
    const r = await setup({ confirm: [{ result: 'already_confirmed' }] }).uc.execute({ paymentId: PAYMENT_ID });
    expect(r).toMatchObject({ appointmentConfirmed: true, confirmation: { result: 'already_confirmed' } });
  });

  it.each(['expired', 'amount_mismatch', 'invalid_state'] as const)('not_confirmable (%s) se conserva sin confirmar la cita', async (reason) => {
    const r = await setup({ confirm: [{ result: 'not_confirmable', reason }] }).uc.execute({ paymentId: PAYMENT_ID });
    expect(r).toMatchObject({ appointmentConfirmed: false, confirmation: { result: 'not_confirmable', reason }, payment: { status: 'succeeded' } });
  });

  it('el error del proveedor se propaga sin confirmar', async () => {
    const s = setup({ synced: new Error('Mercado Pago no disponible') });
    await expect(s.uc.execute({ paymentId: PAYMENT_ID })).rejects.toThrow('no disponible');
    expect(s.calls.confirm).toEqual([]);
  });
});

describe('SyncAppointmentPaymentUseCase · recuperación', () => {
  it('reintento después de fallar confirmPaid: la primera sincronización es recuperable y la segunda confirma, sin cobrar', async () => {
    const s = setup({ record: { ...RECORD, status: 'succeeded' }, confirm: [new Error('conexión perdida'), { result: 'confirmed' }] });
    const first = await s.uc.execute({ paymentId: PAYMENT_ID });
    expect(first).toMatchObject({ confirmation: { result: 'confirmation_failed' }, appointmentConfirmed: false, payment: { status: 'succeeded' } });
    const second = await s.uc.execute({ paymentId: PAYMENT_ID });
    expect(second).toMatchObject({ confirmation: { result: 'confirmed' }, appointmentConfirmed: true });
    expect(s.calls.confirm).toHaveLength(2);
    expect(s.calls.create).toBe(0);
  });

  it('sincronizar varias veces un pago ya confirmado es idempotente (already_confirmed) y nunca cobra', async () => {
    const s = setup({ confirm: [{ result: 'confirmed' }, { result: 'already_confirmed' }, { result: 'already_confirmed' }] });
    for (let i = 0; i < 3; i++) await s.uc.execute({ paymentId: PAYMENT_ID });
    expect(s.calls.confirm.map((c) => c[1])).toEqual([PAYMENT_ID, PAYMENT_ID, PAYMENT_ID]);
    expect(s.calls.create).toBe(0);
  });
});

describe('SyncAppointmentPaymentUseCase · validaciones y CC-4', () => {
  it('pago inexistente o que no es de consulta', async () => {
    await expect(setup({ record: null }).uc.execute({ paymentId: PAYMENT_ID })).rejects.toThrow(PaymentNotFoundError);
    await expect(setup({ record: { ...RECORD, type: 'medication', appointmentId: null } }).uc.execute({ paymentId: PAYMENT_ID })).rejects.toThrow(NotAnAppointmentPaymentError);
  });

  it('CC-4: un paciente distinto no sincroniza el pago (ni se consulta al proveedor)', async () => {
    const s = setup();
    await expect(s.uc.execute({ paymentId: PAYMENT_ID, requestingPatientId: 'otro' })).rejects.toThrow(AppointmentPatientMismatchError);
    expect(s.calls.getPayment).toEqual([]);
  });

  it('CC-4: el paciente del pago puede sincronizar el suyo', async () => {
    expect((await setup().uc.execute({ paymentId: PAYMENT_ID, requestingPatientId: 'pat-1' })).appointmentConfirmed).toBe(true);
  });

  it('CC-4: si la cita no es del paciente del pago, no se confirma', async () => {
    const s = setup({ appointment: { ...APPOINTMENT, patientId: 'otro' } });
    await expect(s.uc.execute({ paymentId: PAYMENT_ID })).rejects.toThrow(AppointmentPatientMismatchError);
    expect(s.calls.confirm).toEqual([]);
  });

  it('la cita es de otro médico que el pago: no se confirma (misma regla que el webhook)', async () => {
    const s = setup({ appointment: { ...APPOINTMENT, doctorId: 'otro-medico' } });
    const e = await s.uc.execute({ paymentId: PAYMENT_ID }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(PaymentAppointmentMismatchError);
    expect(e).toBeInstanceOf(AppointmentPatientMismatchError); // misma respuesta HTTP genérica (403)
    expect((e as PaymentAppointmentMismatchError).party).toBe('doctor');
    expect(s.calls.confirm).toEqual([]);
  });

  it('la cita leída no es la del pago: no se confirma', async () => {
    const s = setup({ appointment: { ...APPOINTMENT, appointmentId: 'apt-otra' } });
    await expect(s.uc.execute({ paymentId: PAYMENT_ID })).rejects.toMatchObject({ party: 'appointment' });
    expect(s.calls.confirm).toEqual([]);
  });

  it('cita inexistente: no se confirma', async () => {
    const s = setup({ appointment: null });
    await expect(s.uc.execute({ paymentId: PAYMENT_ID })).rejects.toThrow(AppointmentNotFoundForPaymentError);
    expect(s.calls.confirm).toEqual([]);
  });
});
