import type { ConfirmationResult } from '../../../appointments/application/integration/appointment-integration.services';
import { money } from '../../domain/money';
import type { AppointmentForPayment } from '../ports/appointment-payment.reader';
import {
  AppointmentNotFoundForPaymentError,
  AppointmentPatientMismatchError,
  assertPaymentMatchesAppointment,
  confirmCapturedPayment,
  isAppointmentConfirmed,
  PaymentAppointmentMismatchError,
  requiresPaymentErrorRefund,
  type PaymentIdentity,
} from './payment-appointment-identity';
import { UnconfirmableRefundRequestError } from '../refunds.errors';

// Unitarias: la regla de identidad y el paso de confirmación que comparten el pago, la sincronización y el webhook.
const PAYMENT = { id: 'pay-1', type: 'consultation' as const, appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: 'succeeded' as const, gross: money(65_000) };
const APPOINTMENT: AppointmentForPayment = { appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: 'pending_payment', price: money(65_000), paymentHoldExpiresAt: null };

const party = (payment: PaymentIdentity, appointment = APPOINTMENT) => {
  try {
    assertPaymentMatchesAppointment(payment, appointment);
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(PaymentAppointmentMismatchError);
    expect(e).toBeInstanceOf(AppointmentPatientMismatchError);
    expect((e as Error).message).toBe('No puede pagar esta cita'); // genérico: no revela de quién es la cita
    return (e as PaymentAppointmentMismatchError).party;
  }
};

describe('assertPaymentMatchesAppointment', () => {
  it('acepta el pago de la misma cita, paciente y médico', () => {
    expect(party(PAYMENT)).toBeNull();
  });

  it.each([
    ['otra cita', { ...PAYMENT, appointmentId: 'apt-2' }, 'appointment'],
    ['un pago de medicamento', { ...PAYMENT, type: 'medication' as const }, 'appointment'],
    ['otro paciente', { ...PAYMENT, patientId: 'pat-2' }, 'patient'],
    ['otro médico', { ...PAYMENT, doctorId: 'doc-2' }, 'doctor'],
    ['sin médico', { ...PAYMENT, doctorId: null }, 'doctor'],
  ])('rechaza %s', (_n, payment, expected) => {
    expect(party(payment)).toBe(expected);
  });
});

describe('confirmCapturedPayment', () => {
  function deps(result: ConfirmationResult | Error = { result: 'confirmed' }, appointment: AppointmentForPayment | null = APPOINTMENT) {
    const calls = { read: 0, confirm: [] as [string, string, string][] };
    return {
      calls,
      d: {
        appointments: { findForPayment: async () => (calls.read++, appointment) },
        confirmation: {
          confirmPaid: async (a: string, p: string, amount: string) => {
            calls.confirm.push([a, p, amount]);
            if (result instanceof Error) throw result;
            return result;
          },
        },
      },
    };
  }

  it('solo un pago succeeded pide confirmación, con el bruto en decimal', async () => {
    const { d, calls } = deps();
    expect(await confirmCapturedPayment(d, PAYMENT)).toEqual({ result: 'confirmed' });
    expect(calls.confirm).toEqual([['apt-1', 'pay-1', '650.00']]);
    for (const status of ['pending', 'processing', 'failed', 'refunded', 'in_dispute'] as const) {
      expect(await confirmCapturedPayment(d, { ...PAYMENT, status })).toEqual({ result: 'not_requested' });
    }
    expect(calls.confirm).toHaveLength(1);
  });

  it('reutiliza la cita ya leída', async () => {
    const { d, calls } = deps();
    await confirmCapturedPayment(d, PAYMENT, APPOINTMENT);
    expect(calls.read).toBe(0);
  });

  it('identidad distinta o cita inexistente: no llama a M08', async () => {
    const other = deps({ result: 'confirmed' }, { ...APPOINTMENT, doctorId: 'doc-2' });
    await expect(confirmCapturedPayment(other.d, PAYMENT)).rejects.toMatchObject({ party: 'doctor' });
    expect(other.calls.confirm).toEqual([]);
    const none = deps({ result: 'confirmed' }, null);
    await expect(confirmCapturedPayment(none.d, PAYMENT)).rejects.toBeInstanceOf(AppointmentNotFoundForPaymentError);
    await expect(confirmCapturedPayment(none.d, { ...PAYMENT, appointmentId: null })).rejects.toMatchObject({ party: 'appointment' });
  });

  it('un fallo de M08 es confirmation_failed (recuperable); not_confirmable se devuelve tal cual', async () => {
    expect(await confirmCapturedPayment(deps(new Error('M08 caído')).d, PAYMENT)).toEqual({ result: 'confirmation_failed' });
    expect(await confirmCapturedPayment(deps({ result: 'not_confirmable', reason: 'expired' }).d, PAYMENT)).toEqual({ result: 'not_confirmable', reason: 'expired' });
  });

  it('isAppointmentConfirmed: confirmed y already_confirmed', () => {
    expect([{ result: 'confirmed' }, { result: 'already_confirmed' }, { result: 'not_requested' }, { result: 'confirmation_failed' }].map((o) => isAppointmentConfirmed(o as never))).toEqual([true, true, false, false]);
  });
});

// F5: gancho de reembolso del pago no confirmable en el paso compartido.
describe('confirmCapturedPayment · reembolso de un pago no confirmable', () => {
  const run = async (result: ConfirmationResult, refundFails = false) => {
    const requested: string[] = [];
    const d = {
      appointments: { findForPayment: async () => APPOINTMENT },
      confirmation: { confirmPaid: async () => result },
      refunds: {
        requestForUnconfirmablePayment: async (id: string) => {
          requested.push(id);
          if (refundFails) throw new Error('BD caída');
        },
      },
    };
    return { outcome: await confirmCapturedPayment(d, PAYMENT), requested };
  };

  it.each(['expired', 'amount_mismatch'] as const)('%s: pide el reembolso y devuelve el resultado de M08', async (reason) => {
    const r = await run({ result: 'not_confirmable', reason });
    expect(r).toEqual({ outcome: { result: 'not_confirmable', reason }, requested: ['pay-1'] });
    expect(requiresPaymentErrorRefund(r.outcome)).toBe(true);
  });

  it.each([{ result: 'not_confirmable', reason: 'invalid_state' }, { result: 'confirmed' }, { result: 'already_confirmed' }] as ConfirmationResult[])('%o: no pide reembolso', async (result) => {
    expect((await run(result)).requested).toEqual([]);
  });

  it('si el registro del reembolso falla, se lanza para reintentar (sin perder el caso)', async () => {
    await expect(run({ result: 'not_confirmable', reason: 'expired' }, true)).rejects.toBeInstanceOf(UnconfirmableRefundRequestError);
  });
});
