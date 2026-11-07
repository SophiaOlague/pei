import type { WeeklyWindow } from '../../domain/weekly-schedule';

// M07: persistencia de la agenda sobre las tablas existentes (doctor_availability, doctor_time_off y la columna
// doctor_profile.appointment_duration_minutes). Sin migraciones.
export const AGENDA_REPOSITORY = Symbol('AGENDA_REPOSITORY');

export interface AgendaDoctor {
  doctorProfileId: string;
  durationMinutes: number;
}

export interface TimeOffRecord {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

export interface AgendaRepository {
  // Escrituras: SELECT … FROM doctor_profile WHERE user_profile_id = $1 FOR UPDATE, ANTES de la política operativa
  // (su FOR SHARE es compatible con este candado; el orden inverso podría bloquearse al pasar de compartido a exclusivo).
  lockDoctorByUserProfileId(userProfileId: string): Promise<AgendaDoctor | null>;
  findDoctorByUserProfileId(userProfileId: string): Promise<AgendaDoctor | null>;
  findDoctorById(doctorProfileId: string): Promise<AgendaDoctor | null>;
  setDuration(doctorProfileId: string, minutes: number): Promise<void>;
  listAvailability(doctorProfileId: string): Promise<WeeklyWindow[]>;
  replaceAvailability(doctorProfileId: string, windows: readonly WeeklyWindow[]): Promise<void>;
  // Periodos cuyo fin es posterior a `after` (los pasados se conservan pero no se listan).
  listTimeOffEndingAfter(doctorProfileId: string, after: Date): Promise<TimeOffRecord[]>;
  listTimeOffOverlapping(doctorProfileId: string, startsAt: Date, endsAt: Date): Promise<TimeOffRecord[]>;
  insertTimeOff(record: TimeOffRecord): Promise<void>;
  findTimeOff(doctorProfileId: string, id: string): Promise<TimeOffRecord | null>;
  deleteTimeOff(doctorProfileId: string, id: string): Promise<void>;
}
