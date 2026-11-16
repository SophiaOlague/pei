import { Body, Controller, ForbiddenException, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../auth/session.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentActor } from '../../../auth/current-actor.decorator';
import type { Actor } from '../../../common/application/actor';
import type { CardPaymentData } from '../domain/payment-request';
import { PaymentProviderError, type ProviderNextAction } from '../application/ports/payment-provider.port';
import { PATIENT_PROFILE_READER, type PatientProfileReader } from '../application/ports/patient-profile.reader';
import { PayAppointmentUseCase, type ConfirmationOutcome } from '../application/use-cases/pay-appointment.use-case';
import { PayMedicationOrderUseCase, SyncMedicationOrderPaymentUseCase } from '../application/use-cases/pay-medication-order.use-case';
import { PaymentsUseCases, type PaymentView } from '../application/use-cases/payments.use-cases';
import { NotAnAppointmentPaymentError, SyncAppointmentPaymentUseCase } from '../application/use-cases/sync-appointment-payment.use-case';
import { PayAppointmentDto, PayMedicationOrderDto } from './dto/pay-appointment.dto';

// Rutas del paciente para pagar una consulta o un pedido de medicamentos y sincronizar el estado del pago.
// - El perfil del paciente sale de la sesión (nunca del cuerpo): se compara con la cita o con el pedido.
// - El importe NO viaja en la petición: lo toma el backend de la cita (F3.1) o del pedido.
// - La confirmación de la cita solo ocurre dentro de PayAppointmentUseCase/SyncAppointmentPaymentUseCase (o del
//   webhook), tras un pago capturado y verificado con el proveedor (AP-16): esta capa no llama a M08, y volver de una
//   página de «pago exitoso» no confirma nada.
// - Idempotency-Key es obligatoria: el cliente la conserva entre reintentos de la misma intención de pago.
// - La respuesta no incluye la comisión de PEI, el neto del médico ni las comisiones del procesador.
// - nextAction: el cobro espera la autenticación 3-D Secure del cliente. Solo se entrega al paciente dueño del pago.

export interface PatientPaymentResponse {
  paymentId: string;
  status: PaymentView['status'];
  amount: string;
  currency: 'MXN';
  // true solo si M08 respondió confirmed o already_confirmed.
  appointmentConfirmed: boolean;
  confirmation: ConfirmationOutcome;
  // true si conviene reintentar con la MISMA Idempotency-Key o sincronizar más tarde.
  recoverable: boolean;
  nextAction?: ProviderNextAction;
}

export interface PatientOrderPaymentResponse {
  paymentId: string;
  status: PaymentView['status'];
  amount: string;
  currency: 'MXN';
  recoverable: boolean;
  nextAction?: ProviderNextAction;
}

export function toPatientPaymentResponse(r: {
  payment: PaymentView; confirmation: ConfirmationOutcome; appointmentConfirmed: boolean; recoverable?: boolean; nextAction?: ProviderNextAction | null;
}): PatientPaymentResponse {
  return {
    paymentId: r.payment.paymentId,
    status: r.payment.status,
    amount: r.payment.gross,
    currency: 'MXN',
    appointmentConfirmed: r.appointmentConfirmed,
    confirmation: r.confirmation,
    recoverable: r.recoverable ?? (r.confirmation.result === 'confirmation_failed' || ['pending', 'processing'].includes(r.payment.status)),
    ...(r.nextAction ? { nextAction: r.nextAction } : {}),
  };
}

export function toPatientOrderPaymentResponse(r: { payment: PaymentView; recoverable?: boolean; nextAction?: ProviderNextAction | null }): PatientOrderPaymentResponse {
  return {
    paymentId: r.payment.paymentId,
    status: r.payment.status,
    amount: r.payment.gross,
    currency: 'MXN',
    recoverable: r.recoverable ?? ['pending', 'processing'].includes(r.payment.status),
    ...(r.nextAction ? { nextAction: r.nextAction } : {}),
  };
}

// Datos de la tarjeta para el caso de uso. Con Stripe solo llega `token` (pm_…): el medio de pago es 'card' y no hay
// mensualidades.
export const toCardPaymentData = (body: PayAppointmentDto): CardPaymentData => ({
  token: body.token,
  paymentMethodId: body.paymentMethodId ?? 'card',
  issuerId: body.issuerId,
  installments: body.installments ?? 1,
  ...(body.payerEmail !== undefined ? { payerEmail: body.payerEmail } : {}),
});

@Controller('me/patient')
@UseGuards(SessionGuard, RolesGuard)
@Roles('patient')
export class PatientPaymentsController {
  constructor(
    private readonly pay: PayAppointmentUseCase,
    private readonly sync: SyncAppointmentPaymentUseCase,
    @Inject(PATIENT_PROFILE_READER) private readonly patients: PatientProfileReader,
    private readonly payOrder: PayMedicationOrderUseCase,
    private readonly syncOrder: SyncMedicationOrderPaymentUseCase,
    private readonly payments: PaymentsUseCases,
  ) {}

  @Post('appointments/:id/payment')
  @HttpCode(200)
  async payAppointment(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) appointmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PayAppointmentDto,
  ): Promise<PatientPaymentResponse> {
    const patientId = await this.patientOf(actor);
    const result = await this.pay.execute({ idempotencyKey: idempotencyKey ?? '', patientId, appointmentId, card: toCardPaymentData(body) });
    return toPatientPaymentResponse({ ...result, nextAction: await this.actionFor(result.payment, result.nextAction) });
  }

  @Post('medication-orders/:id/payment')
  @HttpCode(200)
  async payMedicationOrder(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) medicationOrderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PayMedicationOrderDto,
  ): Promise<PatientOrderPaymentResponse> {
    const patientId = await this.patientOf(actor);
    const result = await this.payOrder.execute({ idempotencyKey: idempotencyKey ?? '', patientId, medicationOrderId, card: toCardPaymentData(body) });
    return toPatientOrderPaymentResponse({ ...result, nextAction: await this.actionFor(result.payment, result.nextAction) });
  }

  // Un solo punto de sincronización para ambos checkouts: consulta el estado REAL en el proveedor (nunca cobra).
  @Post('payments/:paymentId/sync')
  @HttpCode(200)
  async syncPayment(@CurrentActor() actor: Actor, @Param('paymentId', ParseUUIDPipe) paymentId: string): Promise<PatientPaymentResponse | PatientOrderPaymentResponse> {
    const patientId = await this.patientOf(actor);
    try {
      try {
        const result = await this.sync.execute({ paymentId, requestingPatientId: patientId });
        return toPatientPaymentResponse({ ...result, nextAction: await this.actionFor(result.payment) });
      } catch (error) {
        if (!(error instanceof NotAnAppointmentPaymentError)) throw error;
        const result = await this.syncOrder.execute({ paymentId, requestingPatientId: patientId });
        return toPatientOrderPaymentResponse({ ...result, nextAction: await this.actionFor(result.payment) });
      }
    } catch (error) {
      // Sin detalles del proveedor ni de la configuración.
      if (error instanceof PaymentProviderError) throw new ServiceUnavailableException('No fue posible consultar el estado del pago. Inténtalo más tarde.');
      throw error;
    }
  }

  // Acción pendiente del cliente. Si el caso de uso no la trae (reintento con la misma clave o sincronización) y el pago
  // sigue en proceso, se consulta al proveedor. Los casos de uso ya validaron que el pago es de este paciente.
  private async actionFor(payment: PaymentView, known?: ProviderNextAction | null): Promise<ProviderNextAction | null> {
    if (known) return known;
    if (payment.status !== 'processing') return null;
    return this.payments.pendingAction(payment.paymentId);
  }

  private async patientOf(actor: Actor): Promise<string> {
    const id = actor.userProfileId ? await this.patients.patientProfileIdFor(actor.userProfileId) : null;
    if (!id) throw new ForbiddenException('Solo un paciente con perfil puede realizar pagos');
    return id;
  }
}
