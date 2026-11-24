import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AppointmentEventSubscribers, type AppointmentDomainEvent } from '../../appointments/application/appointment-events';
import { PaymentProviderError } from '../application/ports/payment-provider.port';
import { AppointmentNoShowRefundHandler, noticeFromOutcomeEvent } from '../application/use-cases/appointment-no-show-refund.handler';

// Videoconsulta: suscripción de pagos a AppointmentOutcomeRecorded (en memoria, después del COMMIT de M08). Es una
// OPTIMIZACIÓN; la garantía es el barrido duradero (ReconcileNoShowRefundsUseCase). Convive con el listener de
// cancelaciones, que no cambia: cada uno solo reacciona a su tipo de evento. Los errores se registran con un código y
// nunca relanzan (no afectan al resultado ya registrado).
@Injectable()
export class AppointmentNoShowRefundListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PaymentsRefunds');
  private unsubscribe?: () => void;

  constructor(
    private readonly subscribers: AppointmentEventSubscribers,
    private readonly handler: AppointmentNoShowRefundHandler,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.subscribers.subscribe((event) => this.onEvent(event));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  async onEvent(event: AppointmentDomainEvent): Promise<void> {
    if (event.type !== 'AppointmentOutcomeRecorded') return;
    try {
      const r = await this.handler.handle(noticeFromOutcomeEvent(event));
      this.logger.log(`AppointmentOutcomeRecorded ${event.appointmentId} (${event.status}): ${r.outcome}${'action' in r ? ` (${r.action})` : ''}`);
    } catch (error) {
      const code = error instanceof PaymentProviderError ? `provider:${error.kind}` : ((error as { name?: string })?.name ?? 'internal');
      this.logger.error(`AppointmentOutcomeRecorded ${event.appointmentId}: no se pudo registrar el reembolso (${code})`);
    }
  }
}
