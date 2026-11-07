import { InvalidCancellationPolicyError } from './appointments.errors';

// RF-16 y RN-021 (CC-1, opción A, AP-4): parámetros operativos de las citas, configurados por el administrador en
// versiones con vigencia. A cada cita se le aplica la versión vigente al reservar (appointment.cancellation_policy_id).
// Los valores iniciales son configuración versionada, no constantes del código (AP-22): se cargan con el procedimiento
// controlado. El límite de espera protegida (60) y la gracia de reconexión (5) aprobados en AP-22 necesitan columnas
// nuevas (M-1 #4) y no se manejan todavía.

export interface PolicyParameters {
  refundDeadlineHours: number;
  maxReschedules: number;
  doctorWaitMinutes: number;
  patientToleranceMinutes: number;
}

export interface PolicyVersion extends PolicyParameters {
  id: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  createdBy: string;
}

// Primera versión (Maestro: RN-016, RN-017 y RN-019; AP-22: W = 30, Tol = 15).
export const INITIAL_POLICY: PolicyParameters = Object.freeze({
  refundDeadlineHours: 24,
  maxReschedules: 2,
  doctorWaitMinutes: 30,
  patientToleranceMinutes: 15,
});

const LIMITS: Record<keyof PolicyParameters, [number, number]> = {
  refundDeadlineHours: [1, 720],
  maxReschedules: [0, 10],
  doctorWaitMinutes: [1, 240],
  patientToleranceMinutes: [1, 240],
};

export function validatePolicy(input: Record<string, unknown>): PolicyParameters {
  const out = {} as PolicyParameters;
  for (const key of Object.keys(LIMITS) as (keyof PolicyParameters)[]) {
    const value = input[key];
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
  return out;
}

export function sameParameters(a: PolicyParameters, b: PolicyParameters): boolean {
  return (Object.keys(LIMITS) as (keyof PolicyParameters)[]).every((k) => a[k] === b[k]);
}
