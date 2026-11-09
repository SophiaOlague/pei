import { randomUUID } from 'crypto';

// Identificador único para los datos que crea una prueba; permite comprobar después que no quedó nada.
export const TEST_PREFIX = 'gst-m00-test';
export const TEST_EMAIL_DOMAIN = 'm00.test.invalid';

// Con el lanzador C2, cada ejecución tiene su propio C2_RUN_ID (c2-AAAAMMDDhhmmss-xxxx) y se incluye en el
// identificador: gst-m00-test-<C2_RUN_ID>-<uuid>. Así se distinguen los registros sintéticos de cada ejecución en la
// rama C2 persistente. El prefijo se conserva, de modo que los filtros por TEST_PREFIX siguen funcionando.
export const C2_RUN_ID_PATTERN = /^c2-\d{14}-[0-9a-f]{4}$/;

export function testTag(env: NodeJS.ProcessEnv = process.env): string {
  const runId = env.C2_RUN_ID;
  if (runId === undefined || runId === '') return `${TEST_PREFIX}-${randomUUID()}`;
  if (!C2_RUN_ID_PATTERN.test(runId)) throw new Error('C2_RUN_ID con formato inválido');
  return `${TEST_PREFIX}-${runId}-${randomUUID()}`;
}
