import { AdminPasswordSetupRequestFailedError } from '../modules/identity/application/use-cases/bootstrap-admin.use-case';
import { AdminAlreadyExistsError, BootstrapAccountHasCredentialError } from '../modules/identity/domain/identity.errors';
import { PasswordSetupNotConfiguredError } from '../modules/identity/infrastructure/auth/better-auth-admin-account.provisioner';
import type { EmailDispatchOutcome } from '../auth/email-dispatches';
import {
  type BootstrapCliDeps,
  contextFromApp,
  EXIT_ABORTED,
  EXIT_EMAIL_FAILED,
  EXIT_OK,
  EXIT_UNEXPECTED,
  EXIT_USAGE,
  parseArgs,
  redactUrls,
  runAdminBootstrap,
} from './admin-bootstrap.run';

// CLI admin:bootstrap con dependencias falsas: sin contexto de Nest, sin base de datos y sin correos.

const ARGS = ['--email', 'Admin@Example.test', '--first-name', 'Administración', '--last-name', 'Pei'];

// El bootstrap solo envía el enlace de contraseña (opción C); la verificación llega en el primer inicio de sesión.
const PASSWORD_SENT: EmailDispatchOutcome[] = [{ kind: 'password_reset', ok: true }];

function fakeDeps(
  options: {
    bootstrap?: () => Promise<any>;
    createContext?: (onCleanupError: (error: unknown) => void) => Promise<any>;
    settleEmails?: () => Promise<EmailDispatchOutcome[]>;
    close?: () => Promise<void>;
    closeDatabase?: () => Promise<void>;
  } = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: string[] = [];
  const deps: BootstrapCliDeps = {
    createContext: async (onCleanupError) => {
      calls.push('createContext');
      if (options.createContext) return options.createContext(onCleanupError);
      return {
        bootstrap: async (input) => {
          calls.push(`bootstrap:${input.email}`);
          return options.bootstrap ? options.bootstrap() : { userProfileId: 'up-1', resumedExistingAccount: false };
        },
        settleEmails: async () => {
          calls.push('settleEmails');
          return options.settleEmails ? options.settleEmails() : PASSWORD_SENT;
        },
        close: async () => {
          calls.push('close');
          await options.close?.();
        },
      };
    },
    closeDatabase: async () => {
      calls.push('closeDatabase');
      await options.closeDatabase?.();
    },
    log: (line) => out.push(line),
    error: (line) => err.push(line),
  };
  return { deps, out, err, calls };
}

describe('CLI admin:bootstrap (DT-12)', () => {
  it('[TC-M02-234][DT-12] argumentos: normaliza el correo; rechaza flags desconocidos, duplicados o incompletos', () => {
    expect(parseArgs(ARGS)).toEqual({ email: 'admin@example.test', firstName: 'Administración', lastName: 'Pei' });
    expect(() => parseArgs(['--email', 'a@b.test', '--role', 'admin'])).toThrow('no permitido');
    expect(() => parseArgs(['--email', 'a@b.test', '--email', 'c@d.test'])).toThrow('no permitido');
    expect(() => parseArgs(['--email'])).toThrow('no permitido');
    expect(() => parseArgs(['--email', 'no-es-correo', '--first-name', 'A', '--last-name', 'B'])).toThrow('Correo inválido');
  });

  it('[TC-M02-234][DT-12] argumentos inválidos → código 2 sin crear el contexto ni tocar la base de datos', async () => {
    const { deps, err, calls } = fakeDeps();
    expect(await runAdminBootstrap(['--role', 'admin'], deps)).toBe(EXIT_USAGE);
    expect(calls).toEqual([]);
    expect(err.join('\n')).toContain('Uso: pnpm admin:bootstrap');
  });

  it('[TC-M02-234][DT-12] éxito → código 0; espera los correos antes de cerrar el contexto y la base de datos', async () => {
    const { deps, out, err, calls } = fakeDeps();
    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_OK);
    expect(calls).toEqual(['createContext', 'bootstrap:admin@example.test', 'settleEmails', 'close', 'closeDatabase']);
    expect(out).toEqual([
      'Administrador creado (user_profile up-1).',
      'Resend aceptó el correo de enlace para definir la contraseña.',
    ]);
    expect(err).toEqual([]);
  });

  it.each([
    ['ya existe un administrador', new AdminAlreadyExistsError()],
    ['APP_WEB_URL ausente', new PasswordSetupNotConfiguredError('falta APP_WEB_URL')],
  ])('[TC-M02-234][DT-10][DT-12] abortado por regla o configuración (%s) → código 1 con el mensaje fijo y cierre', async (_label, error) => {
    const { deps, err, calls } = fakeDeps({ bootstrap: async () => Promise.reject(error), settleEmails: async () => [] });
    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_ABORTED);
    expect(err).toEqual([`Bootstrap abortado: ${error.message}`]);
    expect(calls.slice(-3)).toEqual(['settleEmails', 'close', 'closeDatabase']);
  });

  it('[TC-M02-234][DT-12] fallo al iniciar el contexto → código 3, se informa el tipo y la traza, sin URLs, y se cierra la base de datos', async () => {
    const boom = new Error('connect failed: postgresql://usuario:secreto@host.example.test/db?sslmode=require');
    const { deps, err, calls } = fakeDeps({ createContext: async () => Promise.reject(boom) });

    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_UNEXPECTED);
    const printed = err.join('\n');
    expect(printed).toContain('al iniciar el contexto de la aplicación');
    expect(printed).toContain('Error: connect failed: <url oculta>');
    expect(printed).toMatch(/\n\s+at /); // la traza se conserva: no se ocultan errores de programación
    expect(printed).not.toMatch(/secreto|usuario|host\.example/);
    expect(calls).toEqual(['createContext', 'closeDatabase']);
  });

  it('[TC-M02-234][DT-12] error de programación durante el bootstrap → código 3 (no se presenta como aborto por regla)', async () => {
    const { deps, err } = fakeDeps({ bootstrap: async () => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'id')")) });
    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_UNEXPECTED);
    expect(err[0]).toContain("TypeError: Cannot read properties of undefined (reading 'id')");
    expect(err[0]).not.toContain('Bootstrap abortado');
  });

  it('[TC-M02-234][DT-12] un fallo al cerrar se informa como aviso y no cambia el código del resultado', async () => {
    const { deps, err } = fakeDeps({ closeDatabase: async () => Promise.reject(new Error('cierre fallido https://secreto.example.test/x')) });
    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_OK);
    expect(err[0]).toContain('Aviso: no se pudo cerrar la conexión a la base de datos');
    expect(err[0]).not.toContain('secreto');
  });

  it('[TC-M02-234][DT-12] redactUrls oculta URLs de cualquier esquema y conserva el resto del texto', () => {
    expect(redactUrls('fallo en https://a.test/reset-password/tok?callbackURL=x y postgres://u:p@h/db.')).toBe(
      'fallo en <url oculta> y <url oculta>',
    );
  });

  it('[TC-M02-235][DT-9][DT-12] no declara enviados los correos: espera su resultado antes de cerrar e informa solo lo que Resend aceptó', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const { deps, out, calls } = fakeDeps({ settleEmails: async () => (await pending, PASSWORD_SENT) });

    const run = runAdminBootstrap(ARGS, deps);
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toEqual(['createContext', 'bootstrap:admin@example.test', 'settleEmails']); // no cierra mientras espera
    release();
    expect(await run).toBe(EXIT_OK);
    expect(calls.slice(-2)).toEqual(['close', 'closeDatabase']);
    expect(out.join('\n')).not.toMatch(/Se enviaron/);
  });

  it('[TC-M02-235][DT-9][DT-12] un correo fallido → código 4, motivo sin URLs e indicación de no repetir el bootstrap', async () => {
    const { deps, out, err } = fakeDeps({
      settleEmails: async () => [
        { kind: 'password_reset', ok: false, reason: 'No se pudo enviar el correo: HTTP 422 https://secreto.example.test' },
      ],
    });
    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_EMAIL_FAILED);
    expect(out).toEqual(['Administrador creado (user_profile up-1).']);
    expect(out.join('\n')).not.toMatch(/Resend aceptó/);
    expect(err[0]).toBe('No se pudo enviar el correo de enlace para definir la contraseña: No se pudo enviar el correo: HTTP 422 <url oculta>.');
    expect(err.at(-1)).toContain('no vuelvas a ejecutar el bootstrap');
    expect(err.at(-1)).toContain('Olvidé mi contraseña');
  });

  it('[TC-M02-235][DT-12] si no consta el correo de contraseña → código 4; con cuenta nueva o reanudada solo se espera ese correo', async () => {
    const missing = fakeDeps({ settleEmails: async () => [] });
    expect(await runAdminBootstrap(ARGS, missing.deps)).toBe(EXIT_EMAIL_FAILED);
    expect(missing.err[0]).toBe('No consta que se solicitara el correo de enlace para definir la contraseña.');

    const fresh = fakeDeps({ settleEmails: async () => [{ kind: 'password_reset', ok: true }] });
    expect(await runAdminBootstrap(ARGS, fresh.deps)).toBe(EXIT_OK);
    expect(fresh.err).toEqual([]);

    const resumed = fakeDeps({
      bootstrap: async () => ({ userProfileId: 'up-2', resumedExistingAccount: true }),
      settleEmails: async () => [{ kind: 'password_reset', ok: true }],
    });
    expect(await runAdminBootstrap(ARGS, resumed.deps)).toBe(EXIT_OK);
    expect(resumed.err).toEqual([]);
  });

  it('[TC-M02-235][DT-12] si no se puede comprobar el resultado de los correos → código 4 con aviso', async () => {
    const { deps, err } = fakeDeps({ settleEmails: async () => Promise.reject(new Error('fallo del registro')) });
    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_EMAIL_FAILED);
    expect(err[0]).toContain('Aviso: no se pudo comprobar el resultado de los correos');
  });

  it('[TC-M02-235][DT-12] si el bootstrap falla después de pedir correos, se esperan e informan antes de cerrar', async () => {
    const { deps, err, calls } = fakeDeps({
      bootstrap: async () => Promise.reject(new Error('fallo de la transacción')),
      settleEmails: async () => [{ kind: 'password_reset', ok: true }],
    });
    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_UNEXPECTED);
    expect(err.at(-1)).toBe('Correo solicitado antes del fallo. Resend aceptó el correo de enlace para definir la contraseña.');
    expect(calls.slice(-3)).toEqual(['settleEmails', 'close', 'closeDatabase']);
  });

  describe('contextFromApp: la aplicación de Nest no queda abierta si su preparación falla', () => {
    const prepared = { bootstrap: async () => ({ userProfileId: 'up-1', resumedExistingAccount: false }), settleEmails: async () => [] };

    it('[TC-M02-238][DT-12] preparación correcta: devuelve el contexto y close cierra la aplicación', async () => {
      const app = { close: jest.fn().mockResolvedValue(undefined) };
      const context = await contextFromApp(app, () => prepared, jest.fn());
      expect(app.close).not.toHaveBeenCalled();
      await context.close();
      expect(app.close).toHaveBeenCalledTimes(1);
    });

    it('[TC-M02-238][DT-12] si falla la obtención de un proveedor, cierra la aplicación y propaga el error original', async () => {
      const app = { close: jest.fn().mockResolvedValue(undefined) };
      const onCleanupError = jest.fn();
      const missing = new Error('Nest could not find EMAIL_DISPATCHES element');

      await expect(contextFromApp(app, () => { throw missing; }, onCleanupError)).rejects.toBe(missing);
      expect(app.close).toHaveBeenCalledTimes(1);
      expect(onCleanupError).not.toHaveBeenCalled();
    });

    it('[TC-M02-238][DT-12] si además falla ese cierre, se informa y el error original no se pierde', async () => {
      const closeError = new Error('cierre fallido');
      const app = { close: jest.fn().mockRejectedValue(closeError) };
      const onCleanupError = jest.fn();
      const missing = new Error('proveedor ausente');

      await expect(contextFromApp(app, () => { throw missing; }, onCleanupError)).rejects.toBe(missing);
      expect(onCleanupError).toHaveBeenCalledWith(closeError);
    });

    it('[TC-M02-238][DT-12] de extremo a extremo: preparación fallida → código 3, aplicación cerrada, BD cerrada y aviso del cierre fallido sin URLs', async () => {
      const appClose = jest.fn().mockRejectedValue(new Error('cierre fallido https://secreto.example.test/x'));
      const { deps, err, calls } = fakeDeps({
        createContext: (onCleanupError) =>
          contextFromApp({ close: appClose }, () => { throw new Error('proveedor ausente'); }, onCleanupError),
      });

      expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_UNEXPECTED);
      expect(appClose).toHaveBeenCalledTimes(1);
      expect(calls).toEqual(['createContext', 'closeDatabase']);
      const printed = err.join('\n');
      expect(printed).toContain('Aviso: no se pudo cerrar el contexto de la aplicación');
      expect(printed).toContain('al iniciar el contexto de la aplicación');
      expect(printed).toContain('Error: proveedor ausente');
      expect(printed).not.toContain('secreto');
    });

    it('[TC-M02-238][DT-12] si falla el cierre del contexto, la BD se cierra igualmente', async () => {
      const { deps, err, calls } = fakeDeps({ close: async () => Promise.reject(new Error('cierre fallido')) });
      expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_OK);
      expect(calls.slice(-2)).toEqual(['close', 'closeDatabase']);
      expect(err[0]).toContain('Aviso: no se pudo cerrar el contexto de la aplicación');
    });
  });

  it('[TC-M02-242][DT-12] cuenta existente con contraseña → código 1 con el mensaje fijo, sin datos de la cuenta, y cierre', async () => {
    const { deps, err, calls } = fakeDeps({
      bootstrap: async () => Promise.reject(new BootstrapAccountHasCredentialError()),
      settleEmails: async () => [],
    });
    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_ABORTED);
    expect(err).toEqual([`Bootstrap abortado: ${new BootstrapAccountHasCredentialError().message}`]);
    expect(err.join('\n')).not.toMatch(/admin@example\.test/i);
    expect(calls.slice(-3)).toEqual(['settleEmails', 'close', 'closeDatabase']);
  });

  it('[TC-M02-243][DT-12] fallo al solicitar el enlace tras crear el administrador → código 4; recuperación sin repetir el bootstrap ni afirmar entregas', async () => {
    const failure = new AdminPasswordSetupRequestFailedError('up-9', {
      cause: new Error('fallo al guardar el token https://secreto.example.test/reset-password/abc'),
    });
    const { deps, out, err, calls } = fakeDeps({ bootstrap: async () => Promise.reject(failure), settleEmails: async () => [] });

    expect(await runAdminBootstrap(ARGS, deps)).toBe(EXIT_EMAIL_FAILED);
    const printed = err.join('\n');
    expect(printed).toContain('El administrador quedó creado, pero no se pudo solicitar el enlace para definir la contraseña (user_profile up-9)');
    expect(printed).toContain('Causa: Error: fallo al guardar el token <url oculta>');
    expect(printed).toContain('No vuelvas a ejecutar el bootstrap');
    expect(printed).toContain('«Olvidé mi contraseña»');
    expect(printed).not.toMatch(/una nueva ejecución la reanuda|Resend aceptó|entregad|secreto|\n\s+at /);
    expect(out).toEqual([]);
    expect(calls.slice(-3)).toEqual(['settleEmails', 'close', 'closeDatabase']);
  });
});
