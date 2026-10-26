// DT-12: crea el PRIMER administrador de PEI. Falla cerrado: si ya existe un administrador, aborta.
//
//   pnpm admin:bootstrap --email <correo> --first-name <nombre> --last-name <apellidos>
//
// No acepta un parámetro de rol ni existe un endpoint equivalente. Crea la cuenta sin contraseña y envía un
// único correo: el enlace para definir la contraseña. La verificación del correo llega en el primer inicio de
// sesión. Escribe en la BD configurada en DATABASE_URL: ejecutarlo requiere autorización.
// Argumentos, mensajes y códigos de salida: admin-bootstrap.run.ts.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli.module';
import { BootstrapAdminUseCase } from '../modules/identity/application/use-cases/bootstrap-admin.use-case';
import { db } from '../db';
import { EMAIL_DISPATCHES, type EmailDispatchRegistry } from '../auth/email-dispatches';
import { contextFromApp, runAdminBootstrap } from './admin-bootstrap.run';

if (require.main === module) {
  void runAdminBootstrap(process.argv.slice(2), {
    createContext: async (onCleanupError) => {
      // abortOnError: false para que un fallo de arranque o de app.get se propague a runAdminBootstrap (con el
      // valor por defecto, Nest termina el proceso con abort o exit(1) por su cuenta).
      const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'], abortOnError: false });
      return contextFromApp(
        app,
        () => {
          // Registra los correos desde ahora para esperarlos antes de cerrar el contexto y salir.
          const emails = app.get<EmailDispatchRegistry>(EMAIL_DISPATCHES);
          const useCase = app.get(BootstrapAdminUseCase);
          emails.record();
          return { bootstrap: (input) => useCase.execute(input), settleEmails: () => emails.settle() };
        },
        onCleanupError,
      );
    },
    closeDatabase: () => db.$client.end(),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  }).then((code) => process.exit(code));
}
