import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { doctorAvailability, doctorProfile, doctorTimeOff } from '../../../../db/schema';
import { MINUTES_PER_DAY } from '../../domain/agenda-time';
import { sortWindows, type WeeklyWindow } from '../../domain/weekly-schedule';
import type { AgendaDoctor, AgendaRepository, TimeOffRecord } from '../../application/ports/agenda.repository';

// M07 sobre el esquema existente: doctor_availability (hora local, time), doctor_time_off (timestamptz) y
// doctor_profile.appointment_duration_minutes. PostgreSQL acepta '24:00:00' en una columna time.
const DOCTOR = { doctorProfileId: doctorProfile.id, durationMinutes: doctorProfile.appointmentDurationMinutes };
const TIME_OFF = { id: doctorTimeOff.id, doctorId: doctorTimeOff.doctorId, startsAt: doctorTimeOff.startsAt, endsAt: doctorTimeOff.endsAt, reason: doctorTimeOff.reason };

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  if (minutes === MINUTES_PER_DAY) return '24:00:00';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
}

@Injectable()
export class DrizzleAgendaRepository implements AgendaRepository {
  async lockDoctorByUserProfileId(userProfileId: string): Promise<AgendaDoctor | null> {
    const [row] = await getDbContext().select(DOCTOR).from(doctorProfile).where(eq(doctorProfile.userProfileId, userProfileId)).for('update').limit(1);
    return row ?? null;
  }

  async findDoctorByUserProfileId(userProfileId: string): Promise<AgendaDoctor | null> {
    const [row] = await getDbContext().select(DOCTOR).from(doctorProfile).where(eq(doctorProfile.userProfileId, userProfileId)).limit(1);
    return row ?? null;
  }

  async findDoctorById(doctorProfileId: string): Promise<AgendaDoctor | null> {
    const [row] = await getDbContext().select(DOCTOR).from(doctorProfile).where(eq(doctorProfile.id, doctorProfileId)).limit(1);
    return row ?? null;
  }

  async setDuration(doctorProfileId: string, minutes: number): Promise<void> {
    await getDbContext().update(doctorProfile).set({ appointmentDurationMinutes: minutes }).where(eq(doctorProfile.id, doctorProfileId));
  }

  async listAvailability(doctorProfileId: string): Promise<WeeklyWindow[]> {
    const rows = await getDbContext()
      .select({ weekday: doctorAvailability.weekday, start: doctorAvailability.startTime, end: doctorAvailability.endTime })
      .from(doctorAvailability)
      .where(eq(doctorAvailability.doctorId, doctorProfileId));
    return sortWindows(rows.map((r) => ({ weekday: r.weekday, startMinutes: timeToMinutes(r.start), endMinutes: timeToMinutes(r.end) })));
  }

  async replaceAvailability(doctorProfileId: string, windows: readonly WeeklyWindow[]): Promise<void> {
    const db = getDbContext();
    await db.delete(doctorAvailability).where(eq(doctorAvailability.doctorId, doctorProfileId));
    if (windows.length === 0) return;
    await db.insert(doctorAvailability).values(
      windows.map((w) => ({ doctorId: doctorProfileId, weekday: w.weekday, startTime: minutesToTime(w.startMinutes), endTime: minutesToTime(w.endMinutes) })),
    );
  }

  async listTimeOffEndingAfter(doctorProfileId: string, after: Date): Promise<TimeOffRecord[]> {
    return getDbContext().select(TIME_OFF).from(doctorTimeOff)
      .where(and(eq(doctorTimeOff.doctorId, doctorProfileId), gt(doctorTimeOff.endsAt, after)))
      .orderBy(asc(doctorTimeOff.startsAt), asc(doctorTimeOff.id));
  }

  async listTimeOffOverlapping(doctorProfileId: string, startsAt: Date, endsAt: Date): Promise<TimeOffRecord[]> {
    return getDbContext().select(TIME_OFF).from(doctorTimeOff)
      .where(and(eq(doctorTimeOff.doctorId, doctorProfileId), lt(doctorTimeOff.startsAt, endsAt), gt(doctorTimeOff.endsAt, startsAt)))
      .orderBy(asc(doctorTimeOff.startsAt));
  }

  async insertTimeOff(record: TimeOffRecord): Promise<void> {
    await getDbContext().insert(doctorTimeOff).values(record);
  }

  async findTimeOff(doctorProfileId: string, id: string): Promise<TimeOffRecord | null> {
    const [row] = await getDbContext().select(TIME_OFF).from(doctorTimeOff)
      .where(and(eq(doctorTimeOff.id, id), eq(doctorTimeOff.doctorId, doctorProfileId))).limit(1);
    return row ?? null;
  }

  async deleteTimeOff(doctorProfileId: string, id: string): Promise<void> {
    await getDbContext().delete(doctorTimeOff).where(and(eq(doctorTimeOff.id, id), eq(doctorTimeOff.doctorId, doctorProfileId)));
  }
}
