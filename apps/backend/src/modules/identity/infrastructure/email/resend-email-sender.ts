import type { AuthEmail, EmailSender } from '../../application/ports/email-sender';
import { renderAuthEmail } from './auth-email-templates';

// DT-9: Resend por su API REST con fetch, sin SDK. Variables: RESEND_API_KEY y EMAIL_FROM (dominio verificado).
// Los errores no incluyen la clave, el destinatario ni el enlace.

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export function loadResendConfig(env: NodeJS.ProcessEnv = process.env): ResendConfig | null {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return null;
  return { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM };
}

export class EmailDeliveryError extends Error {
  constructor(reason: string) {
    super(`No se pudo enviar el correo: ${reason}`);
    this.name = 'EmailDeliveryError';
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

// Se registra con useFactory (su configuración no es un proveedor de Nest).
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly config: ResendConfig | null = loadResendConfig(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(email: AuthEmail): Promise<void> {
    if (!this.config) throw new EmailDeliveryError('RESEND_API_KEY o EMAIL_FROM no configurados');
    const { subject, text, html } = renderAuthEmail(email.kind, email.url);

    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.config.from, to: [email.to], subject, text, html }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmailDeliveryError((error as Error)?.name ?? 'error de red');
    }
    if (!response.ok) throw new EmailDeliveryError(`HTTP ${response.status}`);
  }
}
