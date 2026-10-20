// Comprobaciones puras del recorrido de registro (doctor-registration.flow-spec.ts). Sin BD ni red: se prueban en
// flow-checks.spec.ts dentro de la suite unitaria.

// GET /me/doctor/status: estado derivado del médico. No trae `canOperate`.
export interface DoctorStatusBody {
  status?: unknown;
  identity?: unknown;
  professional?: unknown;
  registrationComplete?: unknown;
  missing?: unknown;
}

// GET /me: `registrationStatus.canOperate` lo añade la sección del médico (status === 'approved').
export interface MeBody {
  role?: unknown;
  registrationStatus?: { status?: unknown; canOperate?: unknown } | null;
}

// Tras el registro con las dos revisiones pendientes: registro completo, nada pendiente y SIN poder operar. Devuelve
// los motivos de fallo (vacío si todo se cumple). `canOperate` debe ser exactamente false: true o ausente fallan.
export function registeredPendingFailures(status: DoctorStatusBody, me: MeBody): string[] {
  const failures: string[] = [];
  if (status.status !== 'pending') failures.push('status no es pending');
  if (status.identity !== 'pending') failures.push('identity no es pending');
  if (status.professional !== 'pending') failures.push('professional no es pending');
  if (status.registrationComplete !== true) failures.push('registrationComplete no es true');
  if (!Array.isArray(status.missing) || status.missing.length !== 0) failures.push('missing no está vacío');
  if (me.role !== 'doctor') failures.push('el rol de /me no es doctor');
  if (me.registrationStatus?.status !== 'pending') failures.push('registrationStatus.status de /me no es pending');
  if (me.registrationStatus?.canOperate !== false) failures.push('registrationStatus.canOperate de /me no es false');
  return failures;
}
