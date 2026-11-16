import { assertJestConfigMode } from './c2-mode-setup';

// setupFile de jest-concurrency.json: los candados (FOR UPDATE / FOR SHARE) solo se prueban con conexión directa.
assertJestConfigMode('concurrency');
