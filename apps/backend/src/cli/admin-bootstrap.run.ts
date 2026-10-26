// Lógica del CLI admin:bootstrap sin efectos propios: argumentos, códigos de salida y mensajes. El contexto de
// Nest y el cierre de la BD se inyectan (admin-bootstrap.ts), así que se prueba sin base de datos ni correos.
//
// Códigos de salida:
//   0  administrador creado
//   1  abortado por una regla o por la configuración (ya existe un administrador, cuenta con perfil,
//      APP_WEB_URL ausente o inválida, …): mensaje fijo del error
//   2  argumentos inválidos
//   3  fallo inesperado (arranque del contexto, infraestructura o programación): tipo, mensaje sin URLs y traza
//   4  administrador creado, pero no se pudo solicitar el enlace de contraseña, el correo falló o no consta su envío
//
// Los correos de Better Auth salen sin esperar la respuesta (auth.config.ts): antes de cerrar, el CLI espera a
// que terminen (EmailDispatchRegistry) y solo informa como enviado lo que Resend aceptó (HTTP 2xx), que no es
// lo mismo que entregado en el buzón.
import type { EmailDispatchOutcome } from '../auth/email-dispatches';
import { DomainError } from '../common/domain/domain-error';
import {
  AdminPasswordSetupRequestFailedError,
  type BootstrapAdminInput,
} from '../modules/identity/application/use-cases/bootstrap-admin.use-case';
import { PasswordSetupNotConfiguredError } from '../modules/identity/infrastructure/auth/better-auth-admin-account.provisioner';

export const EXIT_OK = 0;
export const EXIT_ABORTED = 1;
export const EXIT_USAGE = 2;
export const EXIT_UNEXPECTED = 3;
export const EXIT_EMAIL_FAILED = 4;

const USAGE = 'Uso: pnpm admin:bootstrap --email <correo> --first-name <nombre> --last-name <apellidos>';
const ALLOWED = new Set(['--email', '--first-name', '--last-name']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv: string[]): BootstrapAdminInput {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!ALLOWED.has(flag) || value === undefined || value.startsWith('--') || values.has(flag)) {
      throw new Error(`Argumento no permitido o incompleto: ${flag}. ${USAGE}`);
    }
    values.set(flag, value.trim());
  }
  const email = values.get('--email')?.toLowerCase() ?? '';
  const firstName = values.get('--first-name') ?? '';
  const lastName = values.get('--last-name') ?? '';
  if (!EMAIL.test(email)) throw new Error(`Correo inválido. ${USAGE}`);
  if (firstName.length < 1 || firstName.length > 100 || lastName.length < 1 || lastName.length > 100) {
    throw new Error(`Nombre y apellidos deben tener entre 1 y 100 caracteres. ${USAGE}`);
  }
  return { email, firstName, lastName };
}

export interface BootstrapContext {
  bootstrap(input: BootstrapAdminInput): Promise<{ userProfileId: string; resumedExistingAccount: boolean }>;
  // Espera los correos solicitados desde que se creó el contexto y devuelve su resultado.
  settleEmails(): Promise<EmailDispatchOutcome[]>;
  close(): Promise<void>;
}

const EMAIL_LABELS: Record<EmailDispatchOutcome['kind'], string> = {
  email_verification: 'verificación del correo',
  password_reset: 'enlace para definir la contraseña',
};

function describeEmail(outcome: EmailDispatchOutcome): string {
  const label = EMAIL_LABELS[outcome.kind];
  return outcome.ok ? `Resend aceptó el correo de ${label}.` : `No se pudo enviar el correo de ${label}: ${redactUrls(outcome.reason ?? 'error')}.`;
}

export interface BootstrapCliDeps {
  // onCleanupError informa un fallo al cerrar la aplicación si su preparación falló (ver contextFromApp).
  createContext(onCleanupError: (error: unknown) => void): Promise<BootstrapContext>;
  closeDatabase(): Promise<void>;
  log(line: string): void;
  error(line: string): void;
}

// Prepara el contexto sobre una aplicación de Nest ya creada. Si la preparación falla (por ejemplo, al obtener un
// proveedor), la aplicación se cierra antes de propagar el error: runAdminBootstrap no la recibe y no podría
// cerrarla. Un fallo de ese cierre se informa sin ocultar el error original.
export async function contextFromApp(
  app: { close(): Promise<void> },
  prepare: () => Omit<BootstrapContext, 'close'>,
  onCleanupError: (error: unknown) => void,
): Promise<BootstrapContext> {
  try {
    return { ...prepare(), close: () => app.close() };
  } catch (error) {
    try {
      await app.close();
    } catch (closeError) {
      onCleanupError(closeError);
    }
    throw error;
  }
}

// Un error esperado tiene un mensaje fijo y pensado para mostrarse; no incluye valores de configuración.
function isExpectedAbort(error: unknown): error is Error {
  return error instanceof DomainError || error instanceof PasswordSetupNotConfiguredError;
}

// Los mensajes de errores inesperados pueden venir de bibliotecas (driver, Better Auth, red): se ocultan las
// URLs (cadenas de conexión, enlaces con token) y se conserva el resto para no esconder el fallo real.
export function redactUrls(text: string): string {
  return text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>]+/gi, '<url oculta>');
}

// Causa de un fallo ya clasificado: tipo y mensaje sin URLs, sin traza.
function describeCause(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${redactUrls(error.message)}` : `valor no Error de tipo ${typeof error}`;
}

function describeUnexpected(error: unknown): string {
  if (!(error instanceof Error)) return `valor no Error de tipo ${typeof error}`;
  const frames = (error.stack ?? '').split('\n').filter((line) => line.trimStart().startsWith('at '));
  return [`${error.name}: ${redactUrls(error.message)}`, ...frames.map(redactUrls)].join('\n');
}

export async function runAdminBootstrap(argv: string[], deps: BootstrapCliDeps): Promise<number> {
  let input: BootstrapAdminInput;
  try {
    input = parseArgs(argv);
  } catch (error) {
    deps.error((error as Error).message);
    return EXIT_USAGE;
  }

  let context: BootstrapContext | null = null;
  let result: Awaited<ReturnType<BootstrapContext['bootstrap']>> | null = null;
  let failure: unknown = null;
  try {
    context = await deps.createContext((error) =>
      deps.error(`Aviso: no se pudo cerrar el contexto de la aplicación.\n${describeUnexpected(error)}`),
    );
    result = await context.bootstrap(input);
  } catch (error) {
    failure = error;
  }

  // Antes de cerrar: esperar los correos ya solicitados, también si el bootstrap falló después de pedirlos.
  let emails: EmailDispatchOutcome[] | null = null;
  if (context) {
    try {
      emails = await context.settleEmails();
    } catch (error) {
      deps.error(`Aviso: no se pudo comprobar el resultado de los correos.\n${describeUnexpected(error)}`);
    }
  }

  let code: number;
  if (failure instanceof AdminPasswordSetupRequestFailedError) {
    // El administrador existe; repetir el bootstrap abortaría. Solo se informa la causa (tipo y mensaje sin URLs).
    deps.error(
      `${failure.message} (user_profile ${failure.userProfileId}).\n` +
        `Causa: ${describeCause(failure.cause)}\n` +
        'No vuelvas a ejecutar el bootstrap (abortaría). Para definir la contraseña, el administrador puede pedir ' +
        'un enlace nuevo desde «Olvidé mi contraseña» del cliente web.',
    );
    for (const outcome of emails ?? []) deps.error(`Correo solicitado antes del fallo. ${describeEmail(outcome)}`);
    code = EXIT_EMAIL_FAILED;
  } else if (failure !== null || !result) {
    if (isExpectedAbort(failure)) {
      deps.error(`Bootstrap abortado: ${failure.message}`);
      code = EXIT_ABORTED;
    } else {
      deps.error(
        `Bootstrap interrumpido por un fallo inesperado${context ? '' : ' al iniciar el contexto de la aplicación'}.\n` +
          `${describeUnexpected(failure)}\n` +
          'Si la cuenta llegó a crearse sin perfil, una nueva ejecución la reanuda.',
      );
      code = EXIT_UNEXPECTED;
    }
    for (const outcome of emails ?? []) deps.error(`Correo solicitado antes del fallo. ${describeEmail(outcome)}`);
  } else {
    deps.log(`Administrador creado (user_profile ${result.userProfileId}${result.resumedExistingAccount ? ', cuenta existente reanudada' : ''}).`);
    // El bootstrap solo envía el enlace de contraseña; la verificación llega en el primer inicio de sesión.
    const expected: EmailDispatchOutcome['kind'][] = ['password_reset'];
    let emailProblem = emails === null;
    for (const outcome of emails ?? []) {
      if (outcome.ok) deps.log(describeEmail(outcome));
      else {
        deps.error(describeEmail(outcome));
        emailProblem = true;
      }
    }
    for (const kind of expected) {
      if (emails && !emails.some((outcome) => outcome.kind === kind)) {
        deps.error(`No consta que se solicitara el correo de ${EMAIL_LABELS[kind]}.`);
        emailProblem = true;
      }
    }
    if (emailProblem) {
      deps.error(
        'El administrador ya existe: no vuelvas a ejecutar el bootstrap (abortaría). Puede pedir un enlace nuevo desde ' +
          '«Olvidé mi contraseña» del cliente web.',
      );
      code = EXIT_EMAIL_FAILED;
    } else {
      code = EXIT_OK;
    }
  }

  // El cierre no cambia el resultado (el administrador pudo crearse), pero sus fallos se informan.
  try {
    await context?.close();
  } catch (error) {
    deps.error(`Aviso: no se pudo cerrar el contexto de la aplicación.\n${describeUnexpected(error)}`);
  }
  try {
    await deps.closeDatabase();
  } catch (error) {
    deps.error(`Aviso: no se pudo cerrar la conexión a la base de datos.\n${describeUnexpected(error)}`);
  }
  return code;
}
