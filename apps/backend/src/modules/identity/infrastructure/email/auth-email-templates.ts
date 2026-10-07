import type { AuthEmailKind } from '../../application/ports/email-sender';

// Plantillas en español de los correos de autenticación (DP-2). Solo contienen el enlace y un texto
// genérico: sin nombre, correo, CURP ni otros datos personales.

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const COPY: Record<AuthEmailKind, { subject: string; intro: string; action: string }> = {
  email_verification: {
    subject: 'Confirma tu correo en PEI',
    intro: 'Recibimos una solicitud para crear una cuenta en PEI con este correo.',
    action: 'Confirmar correo',
  },
  password_reset: {
    subject: 'Restablece tu contraseña de PEI',
    intro: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta de PEI.',
    action: 'Restablecer contraseña',
  },
};

const FOOTER = 'El enlace vence en 1 hora. Si no hiciste esta solicitud, ignora este correo.';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderAuthEmail(kind: AuthEmailKind, url: string): RenderedEmail {
  const copy = COPY[kind];
  const safeUrl = escapeHtml(url);
  return {
    subject: copy.subject,
    text: `${copy.intro}\n\n${copy.action}: ${url}\n\n${FOOTER}`,
    html:
      `<p>${copy.intro}</p>` +
      `<p><a href="${safeUrl}">${copy.action}</a></p>` +
      `<p>${FOOTER}</p>`,
  };
}
