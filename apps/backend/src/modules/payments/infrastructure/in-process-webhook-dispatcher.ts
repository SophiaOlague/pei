import { Logger } from '@nestjs/common';
import type { WebhookEventDispatcher } from '../application/ports/provider-webhook.port';
import { webhookFailureReason, type ProcessProviderWebhookEventUseCase } from '../application/use-cases/provider-webhook.use-cases';

// Despacho en el mismo proceso, después de responder al proveedor (setImmediate). No es durable: si el proceso cae
// antes de procesar, el evento queda `received` y lo recoge RetryProviderWebhookEventsUseCase. Un error inesperado se
// registra solo con un código (sin datos personales ni del proveedor).
export class InProcessWebhookDispatcher implements WebhookEventDispatcher {
  private readonly logger = new Logger('PaymentsWebhooks');

  constructor(
    private readonly processor: Pick<ProcessProviderWebhookEventUseCase, 'execute'>,
    private readonly schedule: (task: () => void) => void = (task) => void setImmediate(task),
  ) {}

  dispatch(eventId: string): void {
    this.schedule(() => {
      this.processor.execute(eventId).catch((error: unknown) => {
        this.logger.error(`No se pudo procesar el evento de webhook ${eventId} (${webhookFailureReason(error)})`);
      });
    });
  }
}
