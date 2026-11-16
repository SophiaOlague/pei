import { assertJestConfigMode } from './c2-mode-setup';

// setupFile de jest-webhooks.json (H-5): solo el modo `webhooks`, contra C2, con conexión directa y la marca de datos
// confirmados de webhooks (C2_WEBHOOKS_FIXTURES). Lo comprueba assertC2BranchTarget; no abre conexiones.
assertJestConfigMode('webhooks');
