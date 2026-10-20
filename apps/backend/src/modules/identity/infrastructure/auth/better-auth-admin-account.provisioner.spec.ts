import { memoryAdapter } from 'better-auth/adapters/memory';
import { InMemoryAuditTrail, InMemoryIdentityStore, InMemoryUnitOfWork } from '../../../../../test/support/identity-in-memory';
import { createAuth } from '../../../../auth/auth.config';
import { EmailDispatchRegistry } from '../../../../auth/email-dispatches';
import type { AuthEmail, EmailSender } from '../../application/ports/email-sender';
import { AdminPasswordSetupRequestFailedError, BootstrapAdminUseCase } from '../../application/use-cases/bootstrap-admin.use-case';
import { AdminAlreadyExistsError, BootstrapAccountHasCredentialError } from '../../domain/identity.errors';
import { EmailDeliveryError } from '../email/resend-email-sender';
import {
  BetterAuthAdminAccountProvisioner,
  PASSWORD_SETUP_PATH,
  PasswordSetupNotConfiguredError,
  passwordSetupRedirect,
} from './better-auth-admin-account.provisioner';

// Primer administrador con Better Auth (DT-10, DT-12, opción C). Better Auth REAL (createAuth de PEI) con el
// adaptador en memoria y un EmailSender falso: sin base de datos y sin correos reales.

const BACKEND = 'http://localhost:3000';
const WEB = 'http://localhost:3001';
const ADMIN = 'admin@example.test';
const PASSWORD = 'Contrasena-Admin-2026';

class OutboxEmailSender implements EmailSender {
  outbox: AuthEmail[] = [];
  failNext: Error | null = null;
  async send(email: AuthEmail): Promise<void> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.outbox.push(email);
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve)); // los correos salen sin esperar respuesta

function resetToken(sender: OutboxEmailSender): string {
  const link = sender.outbox.filter((m) => m.kind === 'password_reset').at(-1)!;
  return new URL(link.url).pathname.split('/').at(-1)!;
}

function setup(emailDispatches?: EmailDispatchRegistry) {
  const data = { user: [] as any[], session: [] as any[], account: [] as any[], verification: [] as any[] };
  const emailSender = new OutboxEmailSender();
  const auth = createAuth({
    database: memoryAdapter(data),
    emailSender,
    config: { baseURL: BACKEND, secret: 'secreto-solo-para-pruebas-unitarias-de-pei-0123456789', trustedOrigins: [WEB] },
    emailDispatches,
  });
  const post = (path: string, body: object) =>
    auth.handler(
      new Request(`${BACKEND}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: WEB },
        body: JSON.stringify(body),
      }),
    );
  return { auth, data, emailSender, post, provisioner: new BetterAuthAdminAccountProvisioner(auth) };
}

// Caso de uso real con el provisioner real; perfiles, transacción y auditoría en memoria.
function setupBootstrap(emailDispatches: EmailDispatchRegistry) {
  const base = setup(emailDispatches);
  const store = new InMemoryIdentityStore();
  const useCase = new BootstrapAdminUseCase(new InMemoryUnitOfWork(store), new InMemoryAuditTrail(store), store, base.provisioner);
  return { ...base, store, useCase };
}

describe('BetterAuthAdminAccountProvisioner: primer administrador (DT-10, DT-12)', () => {
  const originalAppWebUrl = process.env.APP_WEB_URL;

  afterEach(() => {
    if (originalAppWebUrl === undefined) delete process.env.APP_WEB_URL;
    else process.env.APP_WEB_URL = originalAppWebUrl;
  });

  it.each([WEB, `${WEB}/`])(
    '[TC-M02-230][DT-10] con APP_WEB_URL=%s, el enlace del correo pasa por el backend y redirige a /restablecer-contrasena con el token',
    async (appWebUrl) => {
      process.env.APP_WEB_URL = appWebUrl;
      const { auth, emailSender, provisioner } = setup();

      await provisioner.assertPasswordSetupConfigured();
      await provisioner.createAccount({ email: ADMIN, name: 'Admin Inicial' });
      await provisioner.sendPasswordSetup(ADMIN);
      await flush();

      expect(PASSWORD_SETUP_PATH).toBe('/restablecer-contrasena');
      const resets = emailSender.outbox.filter((m) => m.kind === 'password_reset' && m.to === ADMIN);
      expect(resets).toHaveLength(1);
      const link = new URL(resets[0].url);
      expect(link.origin).toBe(BACKEND);
      expect(link.searchParams.get('callbackURL')).toBe(`${WEB}/restablecer-contrasena`);

      // Paso del navegador: GET del enlace → el backend valida el token y redirige al cliente web.
      const response = await auth.handler(new Request(link.toString()));
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location')!);
      expect(`${location.origin}${location.pathname}`).toBe(`${WEB}/restablecer-contrasena`);
      expect(location.searchParams.get('token')).toBe(link.pathname.split('/').at(-1));
    },
  );

  it.each([
    ['ausente', undefined],
    ['vacía', '   '],
  ])('[TC-M02-231][DT-10] APP_WEB_URL %s: la validación previa y el envío fallan y no sale ningún correo', async (_label, value) => {
    if (value === undefined) delete process.env.APP_WEB_URL;
    else process.env.APP_WEB_URL = value;
    const { emailSender, provisioner } = setup();

    await expect(provisioner.assertPasswordSetupConfigured()).rejects.toThrow(PasswordSetupNotConfiguredError);
    await expect(provisioner.sendPasswordSetup(ADMIN)).rejects.toThrow(PasswordSetupNotConfiguredError);
    await flush();
    expect(emailSender.outbox).toEqual([]);
  });

  it.each([
    ['no es una URL', 'secreto-no-url'],
    ['protocolo no http(s)', 'ftp://secreto.example.test'],
    ['javascript:', 'javascript:alert(1)'],
    ['con credenciales', 'http://usuario:secreto@localhost:3001'],
    ['con query', 'http://localhost:3001/?secreto=1'],
    ['con fragmento', 'http://localhost:3001/#secreto'],
    ['origen no confiable', 'https://secreto.example.test'],
    ['puerto no confiable', 'http://localhost:3999'],
  ])('[TC-M02-232][DT-10] APP_WEB_URL inválida (%s): falla sin correo y el error no muestra el valor', async (_label, value) => {
    process.env.APP_WEB_URL = value;
    const { emailSender, provisioner } = setup();

    const error = await provisioner.assertPasswordSetupConfigured().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PasswordSetupNotConfiguredError);
    expect((error as Error).message).not.toMatch(/secreto|usuario|3999|alert/);
    await expect(provisioner.sendPasswordSetup(ADMIN)).rejects.toThrow(PasswordSetupNotConfiguredError);
    await flush();
    expect(emailSender.outbox).toEqual([]);
  });

  it('[TC-M02-232][DT-10] passwordSetupRedirect conserva una ruta base y aplica la comprobación de orígenes al destino final', () => {
    const checked: string[] = [];
    const target = passwordSetupRedirect('https://pei.example.test/app/', (url) => {
      checked.push(url);
      return true;
    });
    expect(target).toBe('https://pei.example.test/app/restablecer-contrasena');
    expect(checked).toEqual([target]);
  });

  it('[TC-M02-239][DT-12] recorrido completo: cuenta sin credencial ni correo → contraseña → inicio de sesión → verificación → sesión en /completar-registro', async () => {
    process.env.APP_WEB_URL = WEB;
    const { auth, data, emailSender, provisioner, post } = setup();

    // 1. Alta: solo la fila user; sin credencial, sesión ni correo.
    await provisioner.createAccount({ email: ADMIN, name: 'Admin Inicial' });
    await flush();
    expect(data.user).toEqual([expect.objectContaining({ email: ADMIN, emailVerified: false })]);
    expect(data.account).toEqual([]);
    expect(data.session).toEqual([]);
    expect(emailSender.outbox).toEqual([]);

    // 2. Sin contraseña no puede iniciar sesión, y no se envía nada.
    const early = await post('/sign-in/email', { email: ADMIN, password: 'Cualquier-Contrasena-1' });
    expect(early.status).toBe(401);
    expect((await early.json()).code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect(emailSender.outbox).toEqual([]);

    // 3. El único correo del bootstrap: el enlace de contraseña. Restablecer crea la credencial, sin sesión ni
    //    cambio de emailVerified.
    await provisioner.sendPasswordSetup(ADMIN);
    await flush();
    expect(emailSender.outbox.map((m) => m.kind)).toEqual(['password_reset']);
    const reset = await post('/reset-password', { token: resetToken(emailSender), newPassword: PASSWORD });
    expect(reset.status).toBe(200);
    expect(reset.headers.get('set-cookie')).toBeNull();
    expect(data.account).toEqual([expect.objectContaining({ providerId: 'credential' })]);
    expect(data.user[0].emailVerified).toBe(false);
    expect(data.session).toEqual([]);

    // 4. Con contraseña: el inicio de sesión exige verificar el correo y Better Auth envía la verificación.
    const signIn = await post('/sign-in/email', { email: ADMIN, password: PASSWORD, callbackURL: `${WEB}/completar-registro` });
    await flush();
    expect(signIn.status).toBe(403);
    expect((await signIn.json()).code).toBe('EMAIL_NOT_VERIFIED');
    expect(data.session).toEqual([]);
    const verification = emailSender.outbox.filter((m) => m.kind === 'email_verification');
    expect(verification).toHaveLength(1);

    // 5. Verificar: correo verificado, sesión y vuelta al cliente web (que lleva al administrador a /admin).
    const verified = await auth.handler(new Request(verification[0].url));
    expect(verified.status).toBe(302);
    expect(verified.headers.get('location')).toBe(`${WEB}/completar-registro`);
    expect(verified.headers.get('set-cookie')).toContain('session_token');
    expect(data.user[0].emailVerified).toBe(true);
    expect(data.session).toHaveLength(1);

    // 6. A partir de aquí, inicio de sesión normal.
    expect((await post('/sign-in/email', { email: ADMIN, password: PASSWORD })).status).toBe(200);
  });

  it('[TC-M02-239][DT-9][DT-12] con el caso de uso: un solo correo (contraseña), resultado esperado por el registro y reintento sin efectos', async () => {
    process.env.APP_WEB_URL = WEB;
    const registry = new EmailDispatchRegistry();
    registry.record();
    const { emailSender, useCase, store } = setupBootstrap(registry);

    await useCase.execute({ email: ADMIN, firstName: 'Admin', lastName: 'Inicial' });
    expect(await registry.settle()).toEqual([{ kind: 'password_reset', ok: true }]);
    expect(store.state.userProfiles).toEqual([expect.objectContaining({ role: 'admin' })]);

    await expect(useCase.execute({ email: ADMIN, firstName: 'Admin', lastName: 'Inicial' })).rejects.toThrow(AdminAlreadyExistsError);
    await flush();
    expect(emailSender.outbox.map((m) => m.kind)).toEqual(['password_reset']);
  });

  it('[TC-M02-239][DT-9][DT-12] si falla el envío del enlace, el registro recoge el fallo y el administrador puede pedir otro («Olvidé mi contraseña»)', async () => {
    process.env.APP_WEB_URL = WEB;
    const registry = new EmailDispatchRegistry();
    registry.record();
    const { emailSender, useCase, data, post } = setupBootstrap(registry);
    emailSender.failNext = new EmailDeliveryError('HTTP 500');

    await useCase.execute({ email: ADMIN, firstName: 'Admin', lastName: 'Inicial' });
    expect(await registry.settle()).toEqual([{ kind: 'password_reset', ok: false, reason: 'No se pudo enviar el correo: HTTP 500' }]);
    expect(data.account).toEqual([]); // sigue sin contraseña

    // /olvide-contrasena funciona para una cuenta sin credencial.
    const again = await post('/request-password-reset', { email: ADMIN, redirectTo: `${WEB}/restablecer-contrasena` });
    await flush();
    expect(again.status).toBe(200);
    const reset = await post('/reset-password', { token: resetToken(emailSender), newPassword: PASSWORD });
    expect(reset.status).toBe(200);
    expect(data.account).toEqual([expect.objectContaining({ providerId: 'credential' })]);
  });

  it('[TC-M02-239][DT-12] reanudación: una cuenta creada sin perfil se reanuda sin crear otra ni enviar más que el enlace', async () => {
    process.env.APP_WEB_URL = WEB;
    const registry = new EmailDispatchRegistry();
    registry.record();
    const { emailSender, useCase, data, provisioner } = setupBootstrap(registry);
    await provisioner.createAccount({ email: ADMIN, name: 'Admin Inicial' }); // ejecución anterior interrumpida

    expect(await useCase.execute({ email: ADMIN, firstName: 'Admin', lastName: 'Inicial' })).toMatchObject({ resumedExistingAccount: true });
    expect(data.user).toHaveLength(1);
    expect(await registry.settle()).toEqual([{ kind: 'password_reset', ok: true }]);
    expect(emailSender.outbox.map((m) => m.kind)).toEqual(['password_reset']);
  });

  it('[TC-M02-242][DT-12] cuenta creada antes por el registro público (con contraseña): el bootstrap aborta sin rol, perfil ni enlace', async () => {
    process.env.APP_WEB_URL = WEB;
    const registry = new EmailDispatchRegistry();
    registry.record();
    const { auth, data, emailSender, useCase, store, provisioner } = setupBootstrap(registry);
    // Alguien se registra con el correo del administrador y una contraseña que conoce.
    await auth.api.signUpEmail({ body: { email: ADMIN, password: 'Contrasena-De-Otra-Persona-1', name: 'Otra persona' } });
    await flush();
    const userId = data.user[0].id;
    expect(await provisioner.hasPasswordCredential(userId)).toBe(true);

    await expect(useCase.execute({ email: ADMIN, firstName: 'Admin', lastName: 'Inicial' })).rejects.toThrow(BootstrapAccountHasCredentialError);

    expect(store.state.userProfiles).toEqual([]);
    expect(store.state.audit).toEqual([]);
    expect(await registry.settle()).toEqual([{ kind: 'email_verification', ok: true }]); // solo la del registro
    expect(emailSender.outbox.map((m) => m.kind)).toEqual(['email_verification']);
  });

  it('[TC-M02-242][DT-12] hasPasswordCredential: false para la cuenta que crea el bootstrap y true tras definir la contraseña', async () => {
    process.env.APP_WEB_URL = WEB;
    const { emailSender, provisioner, post } = setup();
    const userId = await provisioner.createAccount({ email: ADMIN, name: 'Admin Inicial' });
    expect(await provisioner.hasPasswordCredential(userId)).toBe(false);

    await provisioner.sendPasswordSetup(ADMIN);
    await flush();
    await post('/reset-password', { token: resetToken(emailSender), newPassword: PASSWORD });
    expect(await provisioner.hasPasswordCredential(userId)).toBe(true);
  });

  it('[TC-M02-243][DT-12] si Better Auth falla al solicitar el enlace, el administrador queda creado y el error es AdminPasswordSetupRequestFailedError', async () => {
    process.env.APP_WEB_URL = WEB;
    const registry = new EmailDispatchRegistry();
    registry.record();
    const { auth, useCase, store } = setupBootstrap(registry);
    jest.spyOn(auth.api, 'requestPasswordReset').mockRejectedValueOnce(new Error('fallo al guardar el token'));

    const error = await useCase.execute({ email: ADMIN, firstName: 'Admin', lastName: 'Inicial' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdminPasswordSetupRequestFailedError);
    expect(store.state.userProfiles).toEqual([expect.objectContaining({ id: (error as AdminPasswordSetupRequestFailedError).userProfileId, role: 'admin' })]);
    expect(await registry.settle()).toEqual([]); // no se solicitó ningún correo
  });
});
