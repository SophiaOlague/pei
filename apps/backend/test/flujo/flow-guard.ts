import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de los runners de test/flujo (registro y revisión del admin). Se importa ANTES que cualquier módulo
// del backend: si el destino no es la rama `m03-flujo-medicos` lanzada por C2 (flujo-registro o revision-admin),
// falla al cargar, antes de que src/db cree su pool. No abre conexiones ni muestra valores.
export const FLOW_TARGET = Object.freeze({
  branch: 'br-floral-mode-b5hqaix0',
  endpoint: 'ep-cool-base-b55xjarv',
  project: 'royal-paper-10258990',
  timeline: '291fdc',
});
export const FLOW_MARKER = 'flujo-medicos-accepted';

export function assertFlowTarget(env: NodeJS.ProcessEnv = process.env): void {
  const expected = assertC2BranchTarget(env);
  if (expected.branch !== FLOW_TARGET.branch || expected.endpoint !== FLOW_TARGET.endpoint || env.C2_EXPECTED_PROJECT !== FLOW_TARGET.project) {
    throw new Error('los runners de test/flujo solo se ejecutan contra m03-flujo-medicos (br-floral-mode-b5hqaix0)');
  }
  if (env.C2_COMMITTED_FIXTURES !== FLOW_MARKER) {
    throw new Error(`los runners de test/flujo confirman datos: requieren C2_COMMITTED_FIXTURES=${FLOW_MARKER} (C2 flujo-registro o revision-admin)`);
  }
}

assertFlowTarget();
