// DT-12: crea el PRIMER administrador de PEI. Falla cerrado: si ya existe un administrador, aborta.
//
//   pnpm admin:bootstrap --email <correo> --first-name <nombre> --last-name <apellidos>
//
// No acepta un parámetro de rol ni existe un endpoint equivalente. Crea la cuenta con una contraseña
// aleatoria que se descarta; el administrador recibe el correo de verificación y el enlace para definir
// su contraseña. Escribe en la BD configurada en DATABASE_URL: ejecutarlo requiere autorización.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli.module';
import { BootstrapAdminUseCase } from '../modules/identity/application/use-cases/bootstrap-admin.use-case';
import { db } from '../db';

const USAGE = 'Uso: pnpm admin:bootstrap --email <correo> --first-name <nombre> --last-name <apellidos>';
const ALLOWED = new Set(['--email', '--first-name', '--last-name']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv: string[]): { email: string; firstName: string; lastName: string } {
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

async function main(): Promise<number> {
  let input: ReturnType<typeof parseArgs>;
  try {
    input = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(BootstrapAdminUseCase).execute(input);
    console.log(
      `Administrador creado (user_profile ${result.userProfileId}${result.resumedExistingAccount ? ', cuenta existente reanudada' : ''}). ` +
        'Se enviaron el correo de verificación y el enlace para definir la contraseña.',
    );
    return 0;
  } catch (error) {
    console.error(`Bootstrap abortado: ${(error as Error).message}`);
    return 1;
  } finally {
    await app.close();
    await db.$client.end();
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
