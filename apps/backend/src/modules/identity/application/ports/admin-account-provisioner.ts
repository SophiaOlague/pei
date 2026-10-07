// Cuenta de autenticación del primer administrador (DT-12). La implementa Better Auth: la contraseña se
// genera aleatoria y se descarta; el administrador define la suya con el flujo de recuperación.
export interface AdminAccountProvisioner {
  findUserIdByEmail(email: string): Promise<string | null>;
  // Crea la cuenta sin sesión; Better Auth envía la verificación del correo.
  createAccount(input: { email: string; name: string }): Promise<string>;
  // Envía el enlace para que el administrador defina su contraseña.
  sendPasswordSetup(email: string): Promise<void>;
}

export const ADMIN_ACCOUNT_PROVISIONER = Symbol('ADMIN_ACCOUNT_PROVISIONER');
