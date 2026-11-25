import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, max, ne, or, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { appointment, doctorProfile, meeting, meetingSessionEvent, patientProfile } from '../../../../db/schema';
import type { SessionEvent } from '../../domain/presence';
import type {
  ActiveMeetingSummary, DoctorOpenSession, DoctorOtherConsultations, MeetingPatch, MeetingRecord, MeetingRepository,
} from '../../application/ports/video.ports';

// Videoconsulta: persistencia de meeting y meeting_session_event (0019). Lee `appointment` solo para ubicar las
// consultas del médico y las citas por evaluar (como hace pagos con su lector de citas); los cambios de estado de la
// cita los hace siempre M08 (AppointmentSessionService).

type Row = typeof meeting.$inferSelect;

const toRecord = (r: Row): MeetingRecord => ({
  id: r.id,
  appointmentId: r.appointmentId,
  roomId: r.roomId,
  status: r.status,
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  patientJoinedAt: r.patientJoinedAt,
  doctorJoinedAt: r.doctorJoinedAt,
  patientLastSeenAt: r.patientLastSeenAt,
  doctorLastSeenAt: r.doctorLastSeenAt,
  patientProviderParticipantId: r.patientProviderParticipantId,
  doctorProviderParticipantId: r.doctorProviderParticipantId,
  createdAt: r.createdAt,
});

@Injectable()
export class DrizzleMeetingRepository implements MeetingRepository {
  // Mismo candado que M08 (DA-2): doctor_profile FOR UPDATE, primero.
  async lockDoctorProfile(doctorProfileId: string): Promise<void> {
    await getDbContext().select({ id: doctorProfile.id }).from(doctorProfile).where(eq(doctorProfile.id, doctorProfileId)).for('update').limit(1);
  }

  async findPatientProfileId(userProfileId: string): Promise<string | null> {
    const [row] = await getDbContext().select({ id: patientProfile.id }).from(patientProfile).where(eq(patientProfile.userProfileId, userProfileId)).limit(1);
    return row?.id ?? null;
  }

  async findDoctorProfileId(userProfileId: string): Promise<string | null> {
    const [row] = await getDbContext().select({ id: doctorProfile.id }).from(doctorProfile).where(eq(doctorProfile.userProfileId, userProfileId)).limit(1);
    return row?.id ?? null;
  }

  async lockByAppointmentId(appointmentId: string): Promise<MeetingRecord | null> {
    const [row] = await getDbContext().select().from(meeting).where(eq(meeting.appointmentId, appointmentId)).for('update').limit(1);
    return row ? toRecord(row) : null;
  }

  async insertIfAbsent(m: { id: string; appointmentId: string; createdAt: Date }): Promise<void> {
    await getDbContext().insert(meeting).values({ id: m.id, appointmentId: m.appointmentId, createdAt: m.createdAt }).onConflictDoNothing({ target: meeting.appointmentId });
  }

  async update(id: string, patch: MeetingPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await getDbContext().update(meeting).set(patch).where(eq(meeting.id, id));
  }

  // created_at con clock_timestamp(): dos eventos con la misma hora (p. ej., entrar y salir en el mismo instante) se
  // ordenan por su inserción real. now() es fijo en la transacción y el desempate por id sería aleatorio. Las
  // operaciones de una sala se serializan con el candado de la meeting, así que el orden de inserción es el real.
  async appendEvent(e: { meetingId: string; participant: SessionEvent['participant']; type: SessionEvent['type']; at: Date }): Promise<void> {
    await getDbContext().insert(meetingSessionEvent).values({ meetingId: e.meetingId, participant: e.participant, eventType: e.type, occurredAt: e.at, createdAt: sql`clock_timestamp()` });
  }

  async listEvents(meetingId: string): Promise<SessionEvent[]> {
    const rows = await getDbContext()
      .select({ participant: meetingSessionEvent.participant, type: meetingSessionEvent.eventType, at: meetingSessionEvent.occurredAt })
      .from(meetingSessionEvent)
      .where(eq(meetingSessionEvent.meetingId, meetingId))
      .orderBy(asc(meetingSessionEvent.occurredAt), asc(meetingSessionEvent.createdAt), asc(meetingSessionEvent.id));
    return rows;
  }

  // Otras consultas del médico (otra cita) iniciadas y que lo ocuparon a partir de `since` (T0 de esta cita).
  async doctorOtherConsultations(doctorProfileId: string, exceptAppointmentId: string, since: Date): Promise<DoctorOtherConsultations> {
    const [row] = await getDbContext()
      .select({
        active: sql<number>`count(*) filter (where ${meeting.status} = 'active')`.mapWith(Number),
        lastEndedAt: max(meeting.endedAt),
      })
      .from(meeting)
      .innerJoin(appointment, eq(appointment.id, meeting.appointmentId))
      .where(and(
        eq(appointment.doctorId, doctorProfileId),
        ne(appointment.id, exceptAppointmentId),
        isNotNull(meeting.startedAt),
        or(eq(meeting.status, 'active'), gt(meeting.endedAt, since)),
      ));
    return { active: (row?.active ?? 0) > 0, lastEndedAt: row?.lastEndedAt ?? null };
  }

  async hasOtherActiveMeeting(doctorProfileId: string, exceptAppointmentId: string): Promise<boolean> {
    const [row] = await getDbContext()
      .select({ id: meeting.id })
      .from(meeting)
      .innerJoin(appointment, eq(appointment.id, meeting.appointmentId))
      .where(and(eq(appointment.doctorId, doctorProfileId), ne(appointment.id, exceptAppointmentId), eq(meeting.status, 'active')))
      .limit(1);
    return !!row;
  }

  async listDoctorOpenSessions(doctorProfileId: string): Promise<DoctorOpenSession[]> {
    const rows = await getDbContext()
      .select({ m: meeting, scheduledAt: appointment.scheduledAt })
      .from(meeting)
      .innerJoin(appointment, eq(appointment.id, meeting.appointmentId))
      .where(and(
        eq(appointment.doctorId, doctorProfileId),
        or(eq(meeting.status, 'active'), and(eq(meeting.status, 'scheduled'), eq(appointment.status, 'confirmed'))),
      ))
      .orderBy(asc(appointment.scheduledAt));
    if (rows.length === 0) return [];
    const events = await getDbContext()
      .select({ meetingId: meetingSessionEvent.meetingId, participant: meetingSessionEvent.participant, type: meetingSessionEvent.eventType, at: meetingSessionEvent.occurredAt })
      .from(meetingSessionEvent)
      .where(inArray(meetingSessionEvent.meetingId, rows.map((r) => r.m.id)))
      .orderBy(asc(meetingSessionEvent.occurredAt), asc(meetingSessionEvent.createdAt), asc(meetingSessionEvent.id));
    return rows.map((r) => ({
      appointmentId: r.m.appointmentId,
      scheduledAt: r.scheduledAt,
      meeting: toRecord(r.m),
      events: events.filter((e) => e.meetingId === r.m.id).map(({ participant, type, at }) => ({ participant, type, at })),
    }));
  }

  async listConfirmedAppointmentsDue(now: Date, limit: number): Promise<string[]> {
    const rows = await getDbContext()
      .select({ id: appointment.id })
      .from(appointment)
      .where(and(eq(appointment.status, 'confirmed'), lte(appointment.scheduledAt, now)))
      .orderBy(asc(appointment.scheduledAt), asc(appointment.id))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async listActiveMeetings(): Promise<ActiveMeetingSummary[]> {
    const rows = await getDbContext()
      .select({ appointmentId: meeting.appointmentId, startedAt: meeting.startedAt })
      .from(meeting)
      .where(and(eq(meeting.status, 'active'), isNotNull(meeting.startedAt), isNull(meeting.endedAt)))
      .orderBy(asc(meeting.startedAt));
    return rows.map((r) => ({ appointmentId: r.appointmentId, startedAt: r.startedAt! }));
  }
}
