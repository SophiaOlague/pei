import { assertJestConfigMode } from './c2-mode-setup';

// setupFile de jest-migration.json: solo el modo `migration`, contra la rama aislada (C2_ISOLATED_TARGET) y con
// conexión directa. Así, los specs de migración de M-1 no pueden ejecutarse con esta configuración contra C2.
assertJestConfigMode('migration');
