// Comprobaciones puras de la revisión del admin (doctor-review.flow-spec.ts). Sin BD ni red: se prueban en
// review-checks.spec.ts dentro de la suite unitaria.

export interface ObservedState {
  status?: unknown;
  identity?: unknown;
  professional?: unknown;
  registrationComplete?: unknown;
  missing?: unknown;
  canOperate?: unknown; // de GET /me (registrationStatus.canOperate)
}

export type ReviewStage = 'inicial' | 'ine_aprobada' | 'cedula_rechazada' | 'cedula_reenviada' | 'aprobado';

// Estado derivado esperado tras cada paso del plan (Z-1, deriveDoctorStatus; canOperate solo con approved).
export const EXPECTED_STATES: Readonly<Record<ReviewStage, Required<ObservedState>>> = Object.freeze({
  inicial: { status: 'pending', identity: 'pending', professional: 'pending', registrationComplete: true, missing: [], canOperate: false },
  ine_aprobada: { status: 'pending', identity: 'approved', professional: 'pending', registrationComplete: true, missing: [], canOperate: false },
  // Un rechazo cuenta como entregado (D-30): el registro sigue completo y nada falta.
  cedula_rechazada: { status: 'rejected', identity: 'approved', professional: 'rejected', registrationComplete: true, missing: [], canOperate: false },
  cedula_reenviada: { status: 'pending', identity: 'approved', professional: 'pending', registrationComplete: true, missing: [], canOperate: false },
  aprobado: { status: 'approved', identity: 'approved', professional: 'approved', registrationComplete: true, missing: [], canOperate: true },
});

// Motivos de fallo (vacío si el estado observado es exactamente el esperado). `canOperate` debe ser booleano.
export function stateFailures(stage: ReviewStage, observed: ObservedState): string[] {
  const expected = EXPECTED_STATES[stage];
  const failures: string[] = [];
  for (const key of ['status', 'identity', 'professional', 'registrationComplete', 'canOperate'] as const) {
    if (observed[key] !== expected[key]) failures.push(`${stage}: ${key} no es ${String(expected[key])}`);
  }
  if (!Array.isArray(observed.missing) || observed.missing.length !== 0) failures.push(`${stage}: missing no está vacío`);
  return failures;
}

// Eventos de auditoría que la revisión debe dejar, en orden de acción (sin los de la cuenta del admin, que no tiene).
// El reenvío de la cédula rechazada devuelve el estado a pending: `doctor.status.returned_to_pending` (diseño v3 §I).
export const EXPECTED_REVIEW_AUDIT = Object.freeze([
  'doctor.identity_verification.approved',
  'doctor.license_verification.approved',
  'doctor.license_verification.rejected',
  'doctor.license_verification.submitted',
  'doctor.status.returned_to_pending',
]);

// Ninguna respuesta del admin ni del médico debe exponer claves de objetos ni URLs firmadas.
export function exposesObjectKeys(body: unknown): boolean {
  return /doctor-(identity|licenses)\/|X-Amz-|r2\.cloudflarestorage\.com/.test(JSON.stringify(body ?? null));
}
