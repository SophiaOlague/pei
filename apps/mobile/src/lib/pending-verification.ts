// Correo pendiente de verificar, solo en memoria: no va en la URL ni en almacenamiento persistente.
// Se pierde al cerrar la app; la pantalla de verificación lo pide de nuevo si falta.
let pendingEmail: string | null = null;

export function setPendingVerificationEmail(email: string): void {
  pendingEmail = email;
}

export function getPendingVerificationEmail(): string | null {
  return pendingEmail;
}

export function clearPendingVerificationEmail(): void {
  pendingEmail = null;
}
