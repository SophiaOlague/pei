import { assertC2BranchTarget, assertC2R2Target, C2TargetError, c2ModeOf, type C2Mode } from './c2-target-guard';

// setupFile de las configuraciones de Jest que solo existen para C2 (jest-concurrency.json y jest-r2.json): fija la
// modalidad que exige cada configuración. Así, un spec de concurrencia no puede ejecutarse con el pooler (modo
// postgres) y un spec de R2 no puede ejecutarse sin la salvaguarda del bucket. No abre conexiones.
export function assertJestConfigMode(expected: C2Mode, env: NodeJS.ProcessEnv = process.env): void {
  if (c2ModeOf(env) !== expected) throw new C2TargetError(`esta configuración de Jest exige C2_MODE=${expected}`);
  assertC2BranchTarget(env);
  if (expected === 'r2') assertC2R2Target(env);
}
