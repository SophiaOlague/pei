// Cuenta de autenticación del primer administrador (DT-12). La implementa Better Auth: la cuenta se crea sin
// contraseña y el administrador la define con el flujo de recuperación; después verifica su correo al iniciar sesión.
export interface AdminAccountProvisioner {
  // Sin efectos: falla si el enlace para definir la contraseña no puede construirse (DT-10). Se llama antes de
  // cualquier lectura, escritura o correo del bootstrap.
  assertPasswordSetupConfigured(): Promise<void>;
  findUserIdByEmail(email: string): Promise<string | null>;
  // true si la cuenta tiene una credencial de contraseña (solo se reanudan cuentas sin ella).
  hasPasswordCredential(userId: string): Promise<boolean>;
  // Crea la cuenta sin contraseña, sin sesión y sin enviar correos.
  createAccount(input: { email: string; name: string }): Promise<string>;
  // Envía el enlace para que el administrador defina su contraseña.
  sendPasswordSetup(email: string): Promise<void>;
}

export const ADMIN_ACCOUNT_PROVISIONER = Symbol('ADMIN_ACCOUNT_PROVISIONER');
