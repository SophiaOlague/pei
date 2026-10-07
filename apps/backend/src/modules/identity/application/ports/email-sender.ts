// Correos transaccionales de autenticación (DP-2): verificación de correo y recuperación de contraseña.
// El contenido es genérico (solo el enlace): sin nombre, CURP ni otros datos personales.
export type AuthEmailKind = 'email_verification' | 'password_reset';

export interface AuthEmail {
  kind: AuthEmailKind;
  to: string;
  url: string;
}

export interface EmailSender {
  send(email: AuthEmail): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
