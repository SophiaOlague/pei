import { Body, Controller, Headers, HttpCode, Logger, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { WebhookAuthenticationError } from '../application/ports/provider-webhook.port';
import { ReceiveProviderWebhookUseCase } from '../application/use-cases/provider-webhook.use-cases';

// F3.3 (PAY-15): notificaciones de Mercado Pago. Ruta pública (sin sesión): la autenticidad la da la firma x-signature.
// - 200 en cuanto el evento queda registrado (o ya lo estaba): el procesamiento ocurre en segundo plano.
// - 401 con firma ausente o inválida; no se registra nada.
// - 503 si falta la clave secreta (falla cerrada; Mercado Pago reintentará).
// La respuesta no incluye ids internos, estados del pago ni el motivo exacto del rechazo. Esta capa no llama a M08.

@Controller('webhooks/mercado-pago')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger('PaymentsWebhooks');

  constructor(private readonly receiveWebhook: ReceiveProviderWebhookUseCase) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: { originalUrl?: string; url?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    try {
      await this.receiveWebhook.execute({ url: req.originalUrl ?? req.url ?? '/', headers, body });
      return { received: true };
    } catch (error) {
      if (error instanceof WebhookAuthenticationError) {
        // Solo el motivo técnico; nunca la firma, la clave ni el cuerpo.
        this.logger.warn(`Webhook de Mercado Pago rechazado (${error.reason})`);
        if (error.reason === 'not_configured') throw new ServiceUnavailableException('Webhooks no disponibles');
        throw new UnauthorizedException('Notificación no autenticada');
      }
      throw error;
    }
  }
}
