import { Inject, Injectable } from '@nestjs/common';
import { AppointmentNotFoundError } from '../../domain/appointments.errors';
import { resolveChain } from '../../domain/appointment-chain';
import { APPOINTMENT_REPOSITORY, type AppointmentRepository } from '../ports/appointments.ports';

// M08 DA-6: contratos hacia pagos para las citas reagendadas. M08 es el dueño de la relación entre citas: resuelve la
// raíz; pagos solo sabe buscar el pago de una cita raíz. Sin dependencia de M08 hacia pagos (RT-M08-03): pagos, cuando
// exista, implementa RootPaymentLookup y monta RootResolvingPaymentLedger con AppointmentChainService. Sin ruta HTTP.
// RN-018: el reagendamiento no crea cobros ni reembolsos; un reembolso posterior se hace sobre el pago de la raíz.

@Injectable()
export class AppointmentChainService {
  constructor(@Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository) {}

  // Raíz de la cadena de cualquier cita (ella misma si nunca se reagendó). AppointmentNotFoundError si la cita no
  // existe; AppointmentChainBrokenError si la cadena es inconsistente (antecesor inexistente, ciclo o demasiado larga).
  async rootOf(appointmentId: string): Promise<string> {
    const start = await this.appointments.findById(appointmentId);
    if (!start) throw new AppointmentNotFoundError();
    return (await resolveChain(start, (id) => this.appointments.findById(id))).rootId;
  }
}

// Referencia mínima a un pago: solo identificadores; M08 no conoce montos, estados ni proveedores de pago.
export interface PaymentReference {
  paymentId: string;
  // Cita a la que está ligado el pago: siempre la raíz de la cadena.
  rootAppointmentId: string;
}

// La implementa pagos: el pago ligado a una cita raíz (payment.appointment_id), o null si no hay.
export interface RootPaymentLookup {
  paymentForRootAppointment(rootAppointmentId: string): Promise<PaymentReference | null>;
}

// DA-6: PaymentLedgerPort.paymentForAppointment(id). El pago de cualquier cita de la cadena es el de su raíz.
export interface PaymentLedgerPort {
  paymentForAppointment(appointmentId: string): Promise<PaymentReference | null>;
}

// Composición: la raíz la resuelve M08 (rootOf) y el pago, pagos (RootPaymentLookup). No se registra como proveedor en
// AppointmentsModule porque RootPaymentLookup todavía no tiene implementación.
export class RootResolvingPaymentLedger implements PaymentLedgerPort {
  constructor(
    private readonly chain: Pick<AppointmentChainService, 'rootOf'>,
    private readonly lookup: RootPaymentLookup,
  ) {}

  async paymentForAppointment(appointmentId: string): Promise<PaymentReference | null> {
    return this.lookup.paymentForRootAppointment(await this.chain.rootOf(appointmentId));
  }
}
