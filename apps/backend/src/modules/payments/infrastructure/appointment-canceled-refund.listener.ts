import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AppointmentEventSubscribers, type AppointmentDomainEvent } from '../../appointments/application/appointment-events';
import { PaymentProviderError } from '../application/ports/payment-provider.port';
import { AppointmentCanceledRefundHandler, noticeFromCanceledEvent } from '../application/use-cases/appointment-canceled-refund.handler';

// F5: suscripción de pagos a los eventos de M08 (AppointmentEventSubscribers, exportado por AppointmentsModule para
// los módulos posteriores; M08 no conoce a pagos). Entrega en memoria después del COMMIT de M08: es una OPTIMIZACIÓN
// (reembolso inmediato), no una garantía. Si el proceso cae antes de que este manejador registre el reembolso, la
// cancelación la recupera el barrido duradero (A.25: ReconcileCanceledAppointmentRefundsUseCase).
// Los errores se registran solo con un código; nunca relanzan (no afectan a la cancelación ya confirmada).
@Injectable()
export class AppointmentCanceledRefundListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PaymentsRefunds');
  private unsubscribe?: () => void;

  constructor(
    private readonly subscribers: AppointmentEventSubscribers,
    private readonly handler: AppointmentCanceledRefundHandler,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.subscribers.subscribe((event) => this.onEvent(event));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  async onEvent(event: AppointmentDomainEvent): Promise<void> {
    if (event.type !== 'AppointmentCanceled') return;
    try {
      const r = await this.handler.handle(noticeFromCanceledEvent(event));
      this.logger.log(`AppointmentCanceled ${event.appointmentId}: ${r.outcome}${'action' in r ? ` (${r.action})` : ''}`);
    } catch (error) {
      const code = error instanceof PaymentProviderError ? `provider:${error.kind}` : ((error as { name?: string })?.name ?? 'internal');
      this.logger.error(`AppointmentCanceled ${event.appointmentId}: no se pudo registrar el reembolso (${code})`);
    }
  }
}
