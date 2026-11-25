import { Logger } from '@nestjs/common';
import { AppointmentEventSubscribers } from '../../appointments/application/appointment-events';
import type { AppointmentCanceledRefundHandler } from '../application/use-cases/appointment-canceled-refund.handler';
import { AppointmentCanceledRefundListener } from './appointment-canceled-refund.listener';
import { AppointmentNoShowRefundListener } from './appointment-no-show-refund.listener';

// Suscripción real de AppointmentEventSubscribers (en memoria) con un manejador doble.
const CANCELED = {
  type: 'AppointmentCanceled' as const, appointmentId: 'apt-1', patientProfileId: 'p', doctorProfileId: 'd', occurredAt: '', canceledBy: 'patient' as const, reason: 'motivo privado del paciente', refundOutcome: 'full_refund' as const,
};

describe('AppointmentCanceledRefundListener', () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    const capture = (...args: unknown[]) => {
      logs.push(String(args[0]));
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
  });
  afterEach(() => jest.restoreAllMocks());

  it('se suscribe al iniciar, solo reacciona a AppointmentCanceled y se desuscribe al cerrar', async () => {
    const subscribers = new AppointmentEventSubscribers();
    const handled: unknown[] = [];
    const listener = new AppointmentCanceledRefundListener(subscribers, { handle: async (n: unknown) => (handled.push(n), { outcome: 'no_refund' as const }) } as unknown as AppointmentCanceledRefundHandler);
    listener.onModuleInit();
    await subscribers.dispatch(CANCELED);
    await subscribers.dispatch({ type: 'AppointmentExpired', appointmentId: 'a', patientProfileId: 'p', doctorProfileId: 'd', occurredAt: '', cause: 'timeout' });
    listener.onModuleDestroy();
    await subscribers.dispatch(CANCELED);
    // Entrada común (A.25): el evento llega adaptado, con el mismo eventId que la consulta duradera y sin el motivo.
    expect(handled).toEqual([{ eventId: 'appointment-canceled:apt-1', appointmentId: 'apt-1', rootAppointmentId: null, canceledBy: 'patient', refundOutcome: 'full_refund', occurredAt: '', source: 'event' }]);
    expect(logs).toEqual(['AppointmentCanceled apt-1: no_refund']);
  });

  it('un error no se propaga (la cancelación ya está confirmada) y se registra solo con un código, sin el motivo', async () => {
    const subscribers = new AppointmentEventSubscribers();
    const listener = new AppointmentCanceledRefundListener(subscribers, { handle: async () => Promise.reject(new TypeError('detalle interno con datos')) } as unknown as AppointmentCanceledRefundHandler);
    listener.onModuleInit();
    await expect(subscribers.dispatch(CANCELED)).resolves.toBeUndefined();
    expect(logs).toEqual(['AppointmentCanceled apt-1: no se pudo registrar el reembolso (TypeError)']);
    expect(logs.join()).not.toMatch(/motivo privado|detalle interno/);
  });
});

describe('Listeners de cancelación e inasistencia conviven sin cruzarse', () => {
  it('[TC-VID-176] cada listener solo reacciona a su tipo de evento', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const subscribers = new AppointmentEventSubscribers();
    const canceledSeen: unknown[] = [];
    const noShowSeen: unknown[] = [];
    const canceledListener = new AppointmentCanceledRefundListener(subscribers, { handle: async (n: unknown) => (canceledSeen.push(n), { outcome: 'no_refund' as const }) } as unknown as AppointmentCanceledRefundHandler);
    const noShowListener = new AppointmentNoShowRefundListener(subscribers, { handle: async (n: unknown) => (noShowSeen.push(n), { outcome: 'no_refund' as const }) } as never);
    canceledListener.onModuleInit();
    noShowListener.onModuleInit();
    await subscribers.dispatch(CANCELED);
    await subscribers.dispatch({ type: 'AppointmentOutcomeRecorded', appointmentId: 'apt-2', patientProfileId: 'p', doctorProfileId: 'd', occurredAt: '', status: 'no_show_both', refundOutcome: 'full_refund' });
    expect(canceledSeen).toHaveLength(1);
    expect(noShowSeen).toEqual([{ eventId: 'appointment-outcome:apt-2', appointmentId: 'apt-2', rootAppointmentId: null, status: 'no_show_both', refundOutcome: 'full_refund', occurredAt: '', source: 'event' }]);
    jest.restoreAllMocks();
  });
});
