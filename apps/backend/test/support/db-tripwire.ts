// Interceptor de conexiones a PostgreSQL para TODAS las configuraciones de Jest (setupFiles).
//
// Sin una identidad de C2 válida (assertC2BranchTarget), cualquier connect() o query() del driver de Neon falla
// ANTES de abrir la red: src/db cargaría el DATABASE_URL del .env (rama `production`). Con la identidad de C2 (la rama
// temporal, servicios neutralizados) no hace nada.
//
// Complementa a la salvaguarda explícita de los specs que requieren PostgreSQL (assertC2BranchTarget() al cargar el
// módulo): los specs con dobles (sin BD) siguen ejecutándose sin C2, y si alguno intentara usar la BD por error, ese
// intento se bloquea en lugar de conectar. Jest comparte el registro de módulos entre setupFiles y el archivo de prueba,
// así que se intercepta el mismo Pool que crea src/db.
import { assertC2BranchTarget } from './c2-target-guard';

export class DbTripwireError extends Error {
  constructor(reason: string) {
    super(`Conexión a PostgreSQL bloqueada fuera de C2 (${reason}). Las pruebas con BD solo se ejecutan con C2.`);
    this.name = 'DbTripwireError';
  }
}

export const TRIPWIRE_MARK = Symbol.for('pei.dbTripwire');

type Patchable = { prototype: Record<string, unknown> };

export function installDbTripwire(env: NodeJS.ProcessEnv = process.env): { active: boolean } {
  try {
    assertC2BranchTarget(env);
    return { active: false };
  } catch (error) {
    const reason = (error as Error).message.replace(/^.*mediante C2: /, '');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const driver = require('@neondatabase/serverless') as { Pool: Patchable; Client: Patchable };
    for (const target of [driver.Pool, driver.Client]) {
      for (const method of ['connect', 'query']) {
        const blocked = function blockedByDbTripwire(): never {
          const attempts = ((globalThis as Record<symbol, number>)[TRIPWIRE_MARK] ?? 0) + 1;
          (globalThis as Record<symbol, number>)[TRIPWIRE_MARK] = attempts;
          console.error(`[db-tripwire] intento de ${method} bloqueado (${attempts})`);
          throw new DbTripwireError(reason);
        };
        Object.defineProperty(target.prototype, method, { value: blocked, configurable: true, writable: true });
      }
    }
    return { active: true };
  }
}

installDbTripwire();
