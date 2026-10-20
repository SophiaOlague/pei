import { memoryAdapter } from 'better-auth/adapters/memory';
import type { AuthEmail, EmailSender } from '../modules/identity/application/ports/email-sender';
import { EmailDeliveryError } from '../modules/identity/infrastructure/email/resend-email-sender';
import { BetterAuthAdminAccountProvisioner } from '../modules/identity/infrastructure/auth/better-auth-admin-account.provisioner';
import { createAuth } from './auth.config';
import { EmailDispatchRegistry } from './email-dispatches';

// Seguimiento de los correos de Better Auth (DT-9, DT-12). EmailSender falso con envíos demorados y controlados;
// Better Auth real con el adaptador en memoria. Sin base de datos y sin correos reales.

type Deferred = { email: AuthEmail; resolve: () => void; reject: (error: unknown) => void };

class DelayedEmailSender implements EmailSender {
  pending: Deferred[] = [];
  async send(email: AuthEmail): Promise<void> {
    return new Promise<void>((resolve, reject) => this.pending.push({ email, resolve, reject }));
  }
  take(kind: AuthEmail['kind']): Deferred {
    const found = this.pending.find((p) => p.email.kind === kind);
    if (!found) throw new Error(`sin envío pendiente de tipo ${kind}`);
    return found;
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(registry: EmailDispatchRegistry) {
  const sender = new DelayedEmailSender();
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailSender: sender,
    config: { baseURL: 'http://localhost:3000', secret: 'secreto-solo-para-pruebas-unitarias-de-pei-0123456789', trustedOrigins: ['http://localhost:3001'] },
    emailDispatches: registry,
  });
  return { auth, sender };
}

describe('EmailDispatchRegistry (DT-9, DT-12)', () => {
  const originalAppWebUrl = process.env.APP_WEB_URL;
  afterEach(() => {
    if (originalAppWebUrl === undefined) delete process.env.APP_WEB_URL;
    else process.env.APP_WEB_URL = originalAppWebUrl;
  });

  it('[TC-M02-236][DT-9] sin registro activo no guarda nada (la API no acumula envíos)', async () => {
    const registry = new EmailDispatchRegistry();
    registry.track('password_reset', Promise.resolve());
    registry.track('password_reset', Promise.reject(new Error('x')).catch(() => {}) as Promise<void>);
    expect(await registry.settle()).toEqual([]);
  });

  it('[TC-M02-236][DT-9] settle espera envíos demorados, también los pedidos mientras espera, y no rechaza', async () => {
    const registry = new EmailDispatchRegistry();
    registry.record();
    let first!: () => void;
    let second!: (e: unknown) => void;
    registry.track('email_verification', new Promise<void>((resolve) => (first = resolve)));

    let done = false;
    const settled = registry.settle().then((r) => ((done = true), r));
    await tick();
    registry.track('password_reset', new Promise<void>((_resolve, reject) => (second = reject)));
    first();
    await tick();
    expect(done).toBe(false); // el segundo sigue pendiente
    second(new EmailDeliveryError('HTTP 500'));

    expect(await settled).toEqual([
      { kind: 'email_verification', ok: true },
      { kind: 'password_reset', ok: false, reason: 'No se pudo enviar el correo: HTTP 500' },
    ]);
  });

  it('[TC-M02-236][DT-9] de un error que no es EmailDeliveryError solo se conserva el tipo, nunca el mensaje', async () => {
    const registry = new EmailDispatchRegistry();
    registry.record();
    registry.track('password_reset', Promise.reject(new TypeError('fallo con https://secreto.example.test/?token=abc')));
    const [outcome] = await registry.settle();
    expect(outcome).toEqual({ kind: 'password_reset', ok: false, reason: 'error TypeError' });
  });

  it('[TC-M02-237][DT-9][DT-12] con Better Auth real: signUp y requestPasswordReset responden antes del envío; el registro espera ambos y recoge el fallo', async () => {
    process.env.APP_WEB_URL = 'http://localhost:3001';
    const registry = new EmailDispatchRegistry();
    registry.record();
    const { auth, sender } = setup(registry);
    const provisioner = new BetterAuthAdminAccountProvisioner(auth);

    // Las llamadas terminan con los envíos aún pendientes (sendInBackground): el riesgo de cortar el proceso.
    // signUpEmail (registro de un paciente) envía la verificación; el bootstrap, solo el enlace de contraseña.
    await auth.api.signUpEmail({ body: { email: 'paciente@example.test', password: 'Contrasena-Sintetica-1', name: 'Paciente' } });
    await provisioner.createAccount({ email: 'admin@example.test', name: 'Admin Inicial' });
    await provisioner.sendPasswordSetup('admin@example.test');
    expect(sender.pending.map((p) => p.email.kind)).toEqual(['email_verification', 'password_reset']);

    let done = false;
    const settled = registry.settle().then((r) => ((done = true), r));
    await tick();
    expect(done).toBe(false);

    sender.take('email_verification').resolve();
    await tick();
    expect(done).toBe(false);
    sender.take('password_reset').reject(new EmailDeliveryError('HTTP 422'));

    expect(await settled).toEqual([
      { kind: 'email_verification', ok: true },
      { kind: 'password_reset', ok: false, reason: 'No se pudo enviar el correo: HTTP 422' },
    ]);
  });
});
