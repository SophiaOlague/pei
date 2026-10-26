import { memoryAdapter } from 'better-auth/adapters/memory';
import type { AuthEmail, EmailSender } from '../modules/identity/application/ports/email-sender';
import { AUTH_RATE_LIMIT, createAuth, VERIFICATION_REQUIRES_PASSWORD } from './auth.config';

// Bloqueo de la verificación del correo para cuentas sin contraseña (DT-12, opción C) y no regresión de los
// flujos del paciente (DP-2). Better Auth REAL (createAuth de PEI) con el adaptador en memoria y un EmailSender
// falso: sin base de datos y sin correos reales. Las comprobaciones son sobre los efectos (filas de sesión,
// emailVerified, cookie), no sobre la posición del hook en el código.

const BACKEND = 'http://localhost:3000';
const WEB = 'http://localhost:3001';
const ADMIN = 'admin@example.test';
const PATIENT = 'paciente@example.test';
const PASSWORD = 'Contrasena-Sintetica-1';

class OutboxEmailSender implements EmailSender {
  outbox: AuthEmail[] = [];
  async send(email: AuthEmail): Promise<void> {
    this.outbox.push(email);
  }
  last(kind: AuthEmail['kind'], to: string): AuthEmail {
    const found = this.outbox.filter((m) => m.kind === kind && m.to === to).at(-1);
    if (!found) throw new Error(`sin correo ${kind} para ${to}`);
    return found;
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Límites holgados, como en las E2E de flujos: el límite de peticiones se prueba aparte (TC-M02-070–072, 207, 208).
const RELAXED_RATE_LIMIT = {
  window: 60,
  max: 1000,
  customRules: Object.fromEntries(Object.keys(AUTH_RATE_LIMIT.customRules).map((path) => [path, { window: 60, max: 1000 }])),
};

function setup() {
  const data = { user: [] as any[], session: [] as any[], account: [] as any[], verification: [] as any[] };
  const emailSender = new OutboxEmailSender();
  const auth = createAuth({
    database: memoryAdapter(data),
    emailSender,
    config: { baseURL: BACKEND, secret: 'secreto-solo-para-pruebas-unitarias-de-pei-0123456789', trustedOrigins: [WEB] },
    rateLimit: RELAXED_RATE_LIMIT,
  });
  const post = async (path: string, body: object) => {
    const response = await auth.handler(
      new Request(`${BACKEND}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: WEB },
        body: JSON.stringify(body),
      }),
    );
    await flush();
    return response;
  };
  const get = (url: string) => auth.handler(new Request(url));
  // Cuenta como la deja el bootstrap: solo la fila user, sin credencial.
  const createWithoutPassword = async (email: string) =>
    (await auth.$context).internalAdapter.createUser({ email, name: 'Admin', emailVerified: false }, { method: 'admin' });
  return { auth, data, emailSender, post, get, createWithoutPassword };
}

const userOf = (data: { user: any[] }, email: string) => data.user.find((u) => u.email === email);
const sessionsOf = (data: { user: any[]; session: any[] }, email: string) =>
  data.session.filter((s) => s.userId === userOf(data, email)?.id);

describe('Verificación del correo de una cuenta sin contraseña (DT-12)', () => {
  it('[TC-M02-240][DT-12] enlace prematuro pedido por el endpoint público: vuelve al cliente web con el error, sin sesión ni correo verificado', async () => {
    const { data, emailSender, post, get, createWithoutPassword } = setup();
    await createWithoutPassword(ADMIN);

    // /send-verification-email es público: cualquiera puede pedir el enlace para una cuenta sin verificar.
    expect((await post('/send-verification-email', { email: ADMIN, callbackURL: `${WEB}/completar-registro` })).status).toBe(200);
    const link = emailSender.last('email_verification', ADMIN).url;

    const response = await get(link);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(`${location.origin}${location.pathname}`).toBe(`${WEB}/completar-registro`);
    expect(location.searchParams.get('error')).toBe(VERIFICATION_REQUIRES_PASSWORD);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(sessionsOf(data, ADMIN)).toEqual([]);
    expect(userOf(data, ADMIN).emailVerified).toBe(false);
  });

  it('[TC-M02-240][DT-12] enlace prematuro sin callbackURL: 403 con el código, sin sesión ni correo verificado', async () => {
    const { data, emailSender, post, get, createWithoutPassword } = setup();
    await createWithoutPassword(ADMIN);
    await post('/send-verification-email', { email: ADMIN });
    const link = new URL(emailSender.last('email_verification', ADMIN).url);
    link.searchParams.delete('callbackURL');

    const response = await get(link.toString());
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe(VERIFICATION_REQUIRES_PASSWORD);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(sessionsOf(data, ADMIN)).toEqual([]);
    expect(userOf(data, ADMIN).emailVerified).toBe(false);
  });

  it('[TC-M02-240][DT-12] el inicio de sesión sin contraseña tampoco da sesión ni envía la verificación', async () => {
    const { data, emailSender, post, createWithoutPassword } = setup();
    await createWithoutPassword(ADMIN);

    const response = await post('/sign-in/email', { email: ADMIN, password: PASSWORD });
    expect(response.status).toBe(401);
    expect(emailSender.outbox).toEqual([]);
    expect(sessionsOf(data, ADMIN)).toEqual([]);
  });

  it('[TC-M02-240][DT-12] una vez definida la contraseña, el mismo enlace (aún vigente) sí verifica e inicia la sesión', async () => {
    const { data, emailSender, post, get, createWithoutPassword } = setup();
    await createWithoutPassword(ADMIN);
    await post('/send-verification-email', { email: ADMIN, callbackURL: `${WEB}/completar-registro` });
    const link = emailSender.last('email_verification', ADMIN).url;

    await post('/request-password-reset', { email: ADMIN, redirectTo: `${WEB}/restablecer-contrasena` });
    const token = new URL(emailSender.last('password_reset', ADMIN).url).pathname.split('/').at(-1)!;
    expect((await post('/reset-password', { token, newPassword: PASSWORD })).status).toBe(200);

    const response = await get(link);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${WEB}/completar-registro`);
    expect(userOf(data, ADMIN).emailVerified).toBe(true);
    expect(sessionsOf(data, ADMIN)).toHaveLength(1);
  });
});

describe('Fallo de la BD al comprobar la credencial (B1, DT-12)', () => {
  // La consulta del bloqueo (findCredentialAccount) falla: la verificación se rechaza sin efectos y sin exponer el
  // error interno; al recuperarse la BD, el mismo enlace funciona.
  const dbDown = () => new Error('conexión perdida con postgresql://usuario:secreto@host.example.test/db');

  it('[TC-M02-244][DT-12] cuenta sin contraseña: error 500, sin sesión, cookie ni redirección, y emailVerified sin cambios', async () => {
    const { auth, data, emailSender, post, get, createWithoutPassword } = setup();
    await createWithoutPassword(ADMIN);
    await post('/send-verification-email', { email: ADMIN, callbackURL: `${WEB}/completar-registro` });
    const link = emailSender.last('email_verification', ADMIN).url;
    const lookup = jest.spyOn((await auth.$context).internalAdapter, 'findCredentialAccount').mockRejectedValueOnce(dbDown());

    const response = await get(link);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).not.toMatch(/secreto|usuario|postgresql|conexión perdida/);
    expect(sessionsOf(data, ADMIN)).toEqual([]);
    expect(userOf(data, ADMIN).emailVerified).toBe(false);

    // Con la BD de vuelta, el bloqueo vuelve a decidir: sigue sin contraseña → rechazo con el código.
    const again = await get(link);
    expect(new URL(again.headers.get('location')!).searchParams.get('error')).toBe(VERIFICATION_REQUIRES_PASSWORD);
    expect(sessionsOf(data, ADMIN)).toEqual([]);
  });

  it('[TC-M02-244][DP-2] paciente con contraseña: si la consulta falla, tampoco verifica ni abre sesión; al recuperarse, el mismo enlace verifica', async () => {
    const { auth, data, emailSender, post, get } = setup();
    await post('/sign-up/email', { email: PATIENT, password: PASSWORD, name: 'Paciente', callbackURL: `${WEB}/completar-registro` });
    const link = emailSender.last('email_verification', PATIENT).url;
    jest.spyOn((await auth.$context).internalAdapter, 'findCredentialAccount').mockRejectedValueOnce(dbDown());

    const failed = await get(link);
    expect(failed.status).toBe(500);
    expect(failed.headers.get('set-cookie')).toBeNull();
    expect(sessionsOf(data, PATIENT)).toEqual([]);
    expect(userOf(data, PATIENT).emailVerified).toBe(false);

    const recovered = await get(link);
    expect(recovered.status).toBe(302);
    expect(recovered.headers.get('location')).toBe(`${WEB}/completar-registro`);
    expect(sessionsOf(data, PATIENT)).toHaveLength(1);
    expect(userOf(data, PATIENT).emailVerified).toBe(true);
  });
});

describe('Flujos del paciente sin cambios (DP-2)', () => {
  it('[TC-M02-241][DP-2] registro → verificación: correo verificado, sesión automática y vuelta al callbackURL', async () => {
    const { data, emailSender, post, get } = setup();
    const signUp = await post('/sign-up/email', { email: PATIENT, password: PASSWORD, name: 'Paciente', callbackURL: `${WEB}/completar-registro` });
    expect(signUp.status).toBe(200);
    expect(sessionsOf(data, PATIENT)).toEqual([]);

    const response = await get(emailSender.last('email_verification', PATIENT).url);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${WEB}/completar-registro`);
    expect(response.headers.get('set-cookie')).toContain('session_token');
    expect(userOf(data, PATIENT).emailVerified).toBe(true);
    expect(sessionsOf(data, PATIENT)).toHaveLength(1);
  });

  it('[TC-M02-241][DP-2] inicio de sesión: sin verificar → 403 y reenvío; verificado → 200', async () => {
    const { emailSender, post, get } = setup();
    await post('/sign-up/email', { email: PATIENT, password: PASSWORD, name: 'Paciente' });

    const unverified = await post('/sign-in/email', { email: PATIENT, password: PASSWORD, callbackURL: `${WEB}/completar-registro` });
    expect(unverified.status).toBe(403);
    expect((await unverified.json()).code).toBe('EMAIL_NOT_VERIFIED');
    expect(emailSender.outbox.filter((m) => m.kind === 'email_verification' && m.to === PATIENT)).toHaveLength(2);

    await get(emailSender.last('email_verification', PATIENT).url);
    expect((await post('/sign-in/email', { email: PATIENT, password: PASSWORD })).status).toBe(200);
  });

  it('[TC-M02-241][DP-2] recuperación de contraseña: enlace, restablecer sin sesión y nuevo inicio de sesión', async () => {
    const { data, emailSender, post, get } = setup();
    await post('/sign-up/email', { email: PATIENT, password: PASSWORD, name: 'Paciente' });
    await get(emailSender.last('email_verification', PATIENT).url);

    expect((await post('/request-password-reset', { email: PATIENT, redirectTo: `${WEB}/restablecer-contrasena` })).status).toBe(200);
    const token = new URL(emailSender.last('password_reset', PATIENT).url).pathname.split('/').at(-1)!;
    const reset = await post('/reset-password', { token, newPassword: 'Contrasena-Nueva-2026' });
    expect(reset.status).toBe(200);
    expect(sessionsOf(data, PATIENT)).toEqual([]); // revokeSessionsOnPasswordReset
    expect((await post('/sign-in/email', { email: PATIENT, password: 'Contrasena-Nueva-2026' })).status).toBe(200);
  });

  it('[TC-M02-241][DP-2] un paciente ya verificado que vuelve a abrir el enlace no se ve afectado', async () => {
    const { data, emailSender, post, get } = setup();
    await post('/sign-up/email', { email: PATIENT, password: PASSWORD, name: 'Paciente', callbackURL: `${WEB}/completar-registro` });
    const link = emailSender.last('email_verification', PATIENT).url;
    await get(link);

    const again = await get(link);
    expect(again.status).toBe(302);
    expect(again.headers.get('location')).toBe(`${WEB}/completar-registro`);
    expect(userOf(data, PATIENT).emailVerified).toBe(true);
  });
});
