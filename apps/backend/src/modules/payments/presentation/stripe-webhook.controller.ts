import { Body, Controller, Headers, HttpCode, Logger, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { WebhookAuthenticationError } from '../application/ports/provider-webhook.port';
import { ReceiveProviderWebhookUseCase } from '../application/use-cases/provider-webhook.use-cases';

// Notificaciones de Stripe (PAY-15). Ruta pública (sin sesión): la autenticidad la da la cabecera Stripe-Signature,
// calculada sobre el cuerpo ORIGINAL (req.rawBody, conservado solo para esta ruta por captureStripeRawBody).
// - 200 en cuanto el evento queda registrado (o ya lo estaba): el procesamiento ocurre en segundo plano.
// - 401 con firma ausente o inválida; no se registra nada.
// - 503 si falta el secreto de firma (falla cerrada; Stripe reintentará).
// La respuesta no incluye ids internos, estados del pago ni el motivo exacto del rechazo. Esta capa no llama a M08.

export const STRIPE_WEBHOOK_PATH = 'webhooks/stripe';

// Opción `verify` de body-parser: guarda los bytes del cuerpo SOLO en la ruta del webhook de Stripe, antes de que se
// interprete el JSON. En las demás rutas no se conserva nada.
export function captureStripeRawBody(req: { originalUrl?: string; url?: string; rawBody?: Buffer }, _res: unknown, buf: Buffer): void {
  const path = (req.originalUrl ?? req.url ?? '').split('?')[0].replace(/\/+$/, '');
  if (path === `/${STRIPE_WEBHOOK_PATH}`) req.rawBody = Buffer.from(buf);
}

@Controller(STRIPE_WEBHOOK_PATH)
export class StripeWebhookController {
  private readonly logger = new Logger('PaymentsWebhooks');

  constructor(private readonly receiveWebhook: ReceiveProviderWebhookUseCase) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: { originalUrl?: string; url?: string; rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    try {
      await this.receiveWebhook.execute({ url: req.originalUrl ?? req.url ?? '/', headers, body, rawBody: req.rawBody });
      return { received: true };
    } catch (error) {
      if (error instanceof WebhookAuthenticationError) {
        // Solo el motivo técnico; nunca la firma, el secreto ni el cuerpo.
        this.logger.warn(`Webhook de Stripe rechazado (${error.reason})`);
        if (error.reason === 'not_configured') throw new ServiceUnavailableException('Webhooks no disponibles');
        throw new UnauthorizedException('Notificación no autenticada');
      }
      throw error;
    }
  }
}
