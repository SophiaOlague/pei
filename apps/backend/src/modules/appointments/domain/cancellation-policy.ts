import { InvalidCancellationPolicyError } from './appointments.errors';

// RF-16 y RN-021 (CC-1, opción A, AP-4): parámetros operativos de las citas, configurados por el administrador en
// versiones con vigencia. A cada cita se le aplica la versión vigente al reservar (appointment.cancellation_policy_id).
// Los valores iniciales son configuración versionada, no constantes del código (AP-22): se cargan con el procedimiento
// controlado. AP-22 y M-1 #4 (0013): límite de espera protegida L (max_protected_wait_minutes, 60) y gracia de
// reconexión G (reconnect_grace_minutes, 5); si la publicación los omite, toman esos valores (los DEFAULT del esquema).

export interface PolicyParameters {
  refundDeadlineHours: number;
  maxReschedules: number;
  doctorWaitMinutes: number;
  patientToleranceMinutes: number;
  maxProtectedWaitMinutes: number;
  reconnectGraceMinutes: number;
}

export interface PolicyVersion extends PolicyParameters {
  id: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  createdBy: string;
}

// Primera versión (Maestro: RN-016, RN-017 y RN-019; AP-22: W = 30, Tol = 15, L = 60, G = 5).
export const INITIAL_POLICY: PolicyParameters = Object.freeze({
  refundDeadlineHours: 24,
  maxReschedules: 2,
  doctorWaitMinutes: 30,
  patientToleranceMinutes: 15,
  maxProtectedWaitMinutes: 60,
  reconnectGraceMinutes: 5,
});

// DEFAULT de 0013 para L y G cuando la publicación no los indica.
const WAIT_DEFAULTS = { maxProtectedWaitMinutes: 60, reconnectGraceMinutes: 5 } as const;

const LIMITS: Record<keyof PolicyParameters, [number, number]> = {
  refundDeadlineHours: [1, 720],
  maxReschedules: [0, 10],
  doctorWaitMinutes: [1, 240],
  patientToleranceMinutes: [1, 240],
  maxProtectedWaitMinutes: [1, 480],
  reconnectGraceMinutes: [1, 239],
};

export function validatePolicy(input: Record<string, unknown>): PolicyParameters {
  const out = {} as PolicyParameters;
  for (const key of Object.keys(LIMITS) as (keyof PolicyParameters)[]) {
    const value = input[key] ?? (key in WAIT_DEFAULTS ? WAIT_DEFAULTS[key as keyof typeof WAIT_DEFAULTS] : undefined);
    const [min, max] = LIMITS[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new InvalidCancellationPolicyError(`${key} debe ser un entero entre ${min} y ${max}`);
    }
    out[key] = value;
  }
  // A.11.1: la tolerancia del paciente no supera la ventana del médico.
  if (out.patientToleranceMinutes > out.doctorWaitMinutes) {
    throw new InvalidCancellationPolicyError('la tolerancia del paciente no puede superar la ventana del médico');
  }
  // cancellation_policy_windows_chk (0013): Tol <= W <= L y 0 < G < Tol.
  if (out.doctorWaitMinutes > out.maxProtectedWaitMinutes) {
    throw new InvalidCancellationPolicyError('la ventana del médico no puede superar el límite de espera protegida');
  }
  if (out.reconnectGraceMinutes >= out.patientToleranceMinutes) {
    throw new InvalidCancellationPolicyError('la gracia de reconexión debe ser menor que la tolerancia del paciente');
  }
  return out;
}

export function sameParameters(a: PolicyParameters, b: PolicyParameters): boolean {
  return (Object.keys(LIMITS) as (keyof PolicyParameters)[]).every((k) => a[k] === b[k]);
}
