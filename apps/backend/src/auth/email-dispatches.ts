import type { AuthEmailKind } from '../modules/identity/application/ports/email-sender';
import { EmailDeliveryError } from '../modules/identity/infrastructure/email/resend-email-sender';

// Seguimiento de los correos que Better Auth pide enviar. En la API los correos salen sin esperar la respuesta
// (createAuth, sendInBackground: el tiempo de respuesta no revela si la cuenta existe), y Better Auth atrapa los
// errores de su callback, así que quien llama no sabe si el envío terminó ni cómo. Un proceso que termina por su
// cuenta (CLI) activa el registro y espera los envíos antes de cerrar.
//
// Sin registro activo no se guarda nada (la API no lo activa: sin crecimiento de memoria).

export interface EmailDispatchOutcome {
  kind: AuthEmailKind;
  ok: boolean;
  // Solo el mensaje de EmailDeliveryError (sin clave, destinatario ni enlace) o el tipo de otro error.
  reason?: string;
}

function safeReason(error: unknown): string {
  if (error instanceof EmailDeliveryError) return error.message;
  return error instanceof Error ? `error ${error.name}` : 'error desconocido';
}

export class EmailDispatchRegistry {
  private recorded: Promise<EmailDispatchOutcome>[] | null = null;

  // Llamado por createAuth con cada envío. Nunca rechaza: el resultado se reduce a un EmailDispatchOutcome.
  track(kind: AuthEmailKind, dispatch: Promise<void>): void {
    if (!this.recorded) return;
    this.recorded.push(
      dispatch.then(
        () => ({ kind, ok: true }),
        (error: unknown) => ({ kind, ok: false, reason: safeReason(error) }),
      ),
    );
  }

  // Empieza a registrar los envíos solicitados a partir de ahora.
  record(): void {
    this.recorded ??= [];
  }

  // Espera a que terminen todos los envíos registrados (también los que se soliciten mientras espera) y devuelve
  // su resultado en orden. Cada envío está acotado por el timeout de ResendEmailSender.
  async settle(): Promise<EmailDispatchOutcome[]> {
    const recorded = this.recorded ?? [];
    let settled = 0;
    while (settled < recorded.length) {
      settled = recorded.length;
      await Promise.all(recorded);
    }
    return Promise.all(recorded);
  }
}

export const EMAIL_DISPATCHES = Symbol('EMAIL_DISPATCHES');
