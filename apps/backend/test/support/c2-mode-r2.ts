import { assertJestConfigMode } from './c2-mode-setup';

// setupFile de jest-r2.json: solo el bucket exclusivo de C2 (R2_BUCKET_NAME === C2_EXPECTED_BUCKET === pei-docs-c2-test).
assertJestConfigMode('r2');
