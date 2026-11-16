import { Inject, Injectable, Logger } from '@nestjs/common';
import { AFTER_COMMIT, type AfterCommit } from '../../../common/application/ports/after-commit';
import type { RefundOutcome } from '../domain/cancellation-rules';

// M08 RF-51 (A.3): eventos de dominio de la cita para módulos posteriores (notificaciones). Representan transiciones
// ya confirmadas: se publican DESPUÉS del COMMIT de la transacción que las produce (AFTER_COMMIT) y se descartan si
// termina en rollback. Complementan la auditoría, no la sustituyen. Solo identificadores y datos de la transición:
// sin nombres, contacto ni el motivo de la consulta.

interface AppointmentEventBase {
  appointmentId: string;
  patientProfileId: string;
  doctorProfileId: string;
  // Momento de la transición (reloj de la aplicación), ISO 8601.
  occurredAt: string;
}

// pending_payment → confirmed tras un pago exitoso (confirmPaid). No se emite al crear la retención.
export interface AppointmentConfirmed extends AppointmentEventBase {
  type: 'AppointmentConfirmed';
  scheduledAt: string;
  paymentId: string;
}

// confirmed → canceled por el paciente o el médico (RF-15).
export interface AppointmentCanceled extends AppointmentEventBase {
  type: 'AppointmentCanceled';
  canceledBy: 'patient' | 'doctor';
  // Motivo escrito por quien cancela (opcional para el paciente, obligatorio para el médico).
  reason: string | null;
  refundOutcome: RefundOutcome;
}

// confirmed → rescheduled y cita nueva confirmed (DA-6). appointmentId es la cita nueva (toAppointmentId).
export interface AppointmentRescheduled extends AppointmentEventBase {
  type: 'AppointmentRescheduled';
  fromAppointmentId: string;
  toAppointmentId: string;
  rootAppointmentId: string;
  // Número de reagendamiento dentro de la cadena (1 para el primero).
  rescheduleNumber: number;
  scheduledAt: string;
}

// pending_payment → expired: vencimiento por tiempo (perezoso en la reserva o al confirmar tarde), pago fallido o
// liberación por el paciente. Una sola emisión por cita: solo la transición efectiva, bajo el candado de la cita.
export interface AppointmentExpired extends AppointmentEventBase {
  type: 'AppointmentExpired';
  cause: 'timeout' | 'payment_failed' | 'released';
}

export type AppointmentDomainEvent = AppointmentConfirmed | AppointmentCanceled | AppointmentRescheduled | AppointmentExpired;
export type AppointmentEventHandler = (event: AppointmentDomainEvent) => void | Promise<void>;

// Publicación de eventos desde los casos de uso de M08.
export interface AppointmentEventPublisher {
  publish(event: AppointmentDomainEvent): void;
}
export const APPOINTMENT_EVENT_PUBLISHER = Symbol('APPOINTMENT_EVENT_PUBLISHER');

// Suscripciones en proceso. El módulo de notificaciones (cuando exista) se suscribe aquí; M08 no lo conoce. Un manejador
// que falla no afecta a los demás ni a la operación ya confirmada.
@Injectable()
export class AppointmentEventSubscribers {
  private readonly handlers = new Set<AppointmentEventHandler>();
  private readonly logger = new Logger('AppointmentEvents');

  subscribe(handler: AppointmentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async dispatch(event: AppointmentDomainEvent): Promise<void> {
    // Copia: un manejador puede cancelar su suscripción durante el despacho.
    for (const handler of Array.from(this.handlers)) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(`${event.type} ${event.appointmentId}: manejador fallido: ${(error as Error)?.message ?? String(error)}`);
      }
    }
  }
}

// Publica en los suscriptores solo después del COMMIT.
@Injectable()
export class AfterCommitAppointmentEventPublisher implements AppointmentEventPublisher {
  constructor(
    @Inject(AFTER_COMMIT) private readonly afterCommit: AfterCommit,
    private readonly subscribers: AppointmentEventSubscribers,
  ) {}

  publish(event: AppointmentDomainEvent): void {
    const frozen = Object.freeze({ ...event });
    this.afterCommit.afterCommit(() => this.subscribers.dispatch(frozen));
  }
}
