// Preflight de Payments (paso 0 de la Fase 1). SOLO LECTURA. Antes de usarlo, lee
// docs/testing/payments-preflight.md. Cada ejecución en cada destino necesita su propia autorización expresa.
//
//   Identificación (sin datos):
//     npx ts-node --transpile-only scripts/payments-preflight.ts --identify --env-file <entorno> --out <salida .json>
//   Preflight:
//     npx ts-node --transpile-only scripts/payments-preflight.ts --env-file <entorno> --authorized <huella .json> --out <informe .json>
//
// Los argumentos son obligatorios y no tienen valores por defecto: no se presupone ningún destino, ni siquiera el
// .env del repositorio. DATABASE_URL se lee solo del archivo indicado, sin process.env ni dotenv, y nunca se imprime.
// Ambos modos rechazan un endpoint -pooler antes de conectar. Usan una única conexión (Client).
import { readFileSync, writeFileSync } from 'fs';
import {
  assertDirectEndpoint,
  assertReportHasNoSecrets,
  databaseUrlFromEnvFile,
  parseAuthorizedTarget,
  PreflightAbort,
  runIdentify,
  runPreflight,
  sqlState,
  type PgReadClient,
} from './payments-preflight-core';

export type CliArgs = { mode: 'identify'; envFile: string; out: string } | { mode: 'preflight'; envFile: string; authorized: string; out: string };

export function parseArgs(argv: string[]): CliArgs {
  const identify = argv.includes('--identify');
  if (identify && argv.indexOf('--identify') !== argv.lastIndexOf('--identify')) throw new PreflightAbort('--identify aparece más de una vez');
  const allowed = new Set(identify ? ['--identify', '--env-file', '--out'] : ['--env-file', '--authorized', '--out']);
  for (const a of argv) {
    if (a.startsWith('--') && !allowed.has(a)) {
      throw new PreflightAbort(a === '--authorized' ? '--identify no admite --authorized' : `argumento no reconocido: ${a}`);
    }
  }
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i < 0 || i !== argv.lastIndexOf(flag) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new PreflightAbort(`falta el argumento ${flag} (o aparece más de una vez)`);
    }
    return argv[i + 1];
  };
  return identify
    ? { mode: 'identify', envFile: get('--env-file'), out: get('--out') }
    : { mode: 'preflight', envFile: get('--env-file'), authorized: get('--authorized'), out: get('--out') };
}

export interface ConnectedClient extends PgReadClient {
  end(): Promise<void>;
}

export interface CliDeps {
  readFile: (path: string) => string | null;
  writeFile: (path: string, content: string) => void;
  connect: (databaseUrl: string) => Promise<ConnectedClient>;
  log: (line: string) => void;
}

// Ejecuta un modo completo. Solo informa éxito si TODO terminó bien: la operación, el ROLLBACK (dentro de
// withReadOnlyTransaction), la escritura del archivo y el cierre de la conexión. Cualquier fallo se convierte en
// PreflightAbort con un mensaje propio (sin URL, host, usuario ni contraseña).
export async function runCli(argv: string[], deps: CliDeps): Promise<void> {
  const args = parseArgs(argv);
  const authorized = args.mode === 'preflight' ? parseAuthorizedTarget(deps.readFile(args.authorized)) : null;
  const databaseUrl = databaseUrlFromEnvFile(deps.readFile(args.envFile));
  assertDirectEndpoint(databaseUrl);

  let client: ConnectedClient;
  try {
    client = await deps.connect(databaseUrl);
  } catch (error) {
    throw new PreflightAbort(`no se pudo conectar (SQLSTATE ${sqlState(error)})`);
  }

  let summary: string;
  try {
    const output = authorized
      ? await runPreflight({ databaseUrl, authorized, client })
      : await runIdentify({ databaseUrl, client });
    const serialized = `${JSON.stringify(output, null, 2)}\n`;
    assertReportHasNoSecrets(serialized, databaseUrl);
    try {
      deps.writeFile(args.out, serialized);
    } catch {
      throw new PreflightAbort('no se pudo escribir el archivo de salida');
    }
    summary = 'gate' in output
      ? `preflight completado para «${output.target}»: huella ${output.fingerprintSha256.slice(0, 16)}…, tablas vacías: ` +
        `${output.gate.allTablesEmpty}, anomalías: ${output.gate.anomaliesFound.length}, camino directo: ${output.gate.directPathAllowed}. Informe: ${args.out}`
      : `identificación completada: huella ${output.fingerprintSha256.slice(0, 16)}…. Salida: ${args.out} (plantilla incompleta, no es una autorización)`;
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
  try {
    await client.end();
  } catch (error) {
    throw new PreflightAbort(`no se pudo cerrar la conexión (SQLSTATE ${sqlState(error)})`);
  }
  deps.log(summary);
}

/* istanbul ignore next -- driver real; no se ejecuta en pruebas */
async function main() {
  const { Client, neonConfig } = await import('@neondatabase/serverless');
  const ws = (await import('ws')).default;
  neonConfig.webSocketConstructor = ws;
  await runCli(process.argv.slice(2), {
    readFile: (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    writeFile: (path, content) => writeFileSync(path, content, 'utf8'),
    connect: async (url) => {
      const client = new Client({ connectionString: url });
      await client.connect();
      return {
        query: async (text: string) => ({ rows: (await client.query(text)).rows as Record<string, unknown>[] }),
        end: () => client.end(),
      };
    },
    log: (line) => console.log(line),
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // Solo mensajes propios; nunca el error del driver (podría llevar host, usuario o valores).
    console.error(error instanceof PreflightAbort ? error.message : `preflight abortado: error inesperado (SQLSTATE ${sqlState(error)})`);
    process.exitCode = 1;
  });
}
