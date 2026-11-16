import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { appointment, appointmentStatusHistory, doctorProfile, patientProfile } from '../../../../db/schema';
import type { AppointmentRecord, AppointmentRepository, NewAppointment, RescheduledAppointment, StatusChange } from '../../application/ports/appointments.ports';

// M08 sobre las tablas existentes appointment y appointment_status_history (0000, trigger appointment_guard de 0001).
// Usa el estado rescheduled, rescheduled_from_appointment_id y agenda_block_ends_at (0013) y las referencias legales
// (0014). agenda_block_ends_at se escribe en cada cita nueva (DA-3) y es NOT NULL desde 0015 (M-1c).
const COLUMNS = {
  id: appointment.id,
  patientId: appointment.patientId,
  doctorId: appointment.doctorId,
  status: appointment.status,
  scheduledAt: appointment.scheduledAt,
  reason: appointment.reason,
  price: appointment.price,
  cancellationPolicyId: appointment.cancellationPolicyId,
  paymentHoldExpiresAt: appointment.paymentHoldExpiresAt,
  cancellationReason: appointment.cancellationReason,
  cancelledByType: appointment.cancelledByType,
  cancelledAt: appointment.cancelledAt,
  createdAt: appointment.createdAt,
  agendaBlockEndsAt: appointment.agendaBlockEndsAt,
  rescheduledFromAppointmentId: appointment.rescheduledFromAppointmentId,
  privacyLegalAcceptanceId: appointment.privacyLegalAcceptanceId,
  termsLegalAcceptanceId: appointment.termsLegalAcceptanceId,
};
const ACTIVE = ['confirmed', 'pending_payment'] as const;
const DOCTOR = { doctorProfileId: doctorProfile.id, durationMinutes: doctorProfile.appointmentDurationMinutes };

@Injectable()
export class DrizzleAppointmentRepository implements AppointmentRepository {
  async lockDoctorById(id: string) {
    const [row] = await getDbContext().select(DOCTOR).from(doctorProfile).where(eq(doctorProfile.id, id)).for('update').limit(1);
    return row ?? null;
  }

  async lockDoctorByUserProfileId(userProfileId: string) {
    const [row] = await getDbContext().select(DOCTOR).from(doctorProfile).where(eq(doctorProfile.userProfileId, userProfileId)).for('update').limit(1);
    return row ?? null;
  }

  async lockPatientByUserProfileId(userProfileId: string) {
    const [row] = await getDbContext().select({ patientProfileId: patientProfile.id }).from(patientProfile)
      .where(eq(patientProfile.userProfileId, userProfileId)).for('update').limit(1);
    return row ?? null;
  }

  async findPatientByUserProfileId(userProfileId: string) {
    const [row] = await getDbContext().select({ patientProfileId: patientProfile.id }).from(patientProfile)
      .where(eq(patientProfile.userProfileId, userProfileId)).limit(1);
    return row ?? null;
  }

  async findDoctorByUserProfileId(userProfileId: string) {
    const [row] = await getDbContext().select({ doctorProfileId: doctorProfile.id }).from(doctorProfile)
      .where(eq(doctorProfile.userProfileId, userProfileId)).limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<AppointmentRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(appointment).where(eq(appointment.id, id)).limit(1);
    return (row as AppointmentRecord) ?? null;
  }

  async lockById(id: string): Promise<AppointmentRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(appointment).where(eq(appointment.id, id)).for('update').limit(1);
    return (row as AppointmentRecord) ?? null;
  }

  async listDoctorCandidatesOverlapping(doctorProfileId: string, from: Date, to: Date): Promise<AppointmentRecord[]> {
    return (await getDbContext().select(COLUMNS).from(appointment).where(and(
      eq(appointment.doctorId, doctorProfileId), inArray(appointment.status, [...ACTIVE]), gte(appointment.scheduledAt, from), lt(appointment.scheduledAt, to),
    ))) as AppointmentRecord[];
  }

  async listPatientCandidates(patientProfileId: string, from: Date, to: Date): Promise<AppointmentRecord[]> {
    return (await getDbContext().select(COLUMNS).from(appointment).where(and(
      eq(appointment.patientId, patientProfileId), inArray(appointment.status, [...ACTIVE]), gte(appointment.scheduledAt, from), lt(appointment.scheduledAt, to),
    ))) as AppointmentRecord[];
  }

  async listPatientHolds(patientProfileId: string): Promise<AppointmentRecord[]> {
    return (await getDbContext().select(COLUMNS).from(appointment)
      .where(and(eq(appointment.patientId, patientProfileId), eq(appointment.status, 'pending_payment')))) as AppointmentRecord[];
  }

  async listForPatient(patientProfileId: string): Promise<AppointmentRecord[]> {
    return (await getDbContext().select(COLUMNS).from(appointment).where(eq(appointment.patientId, patientProfileId))
      .orderBy(desc(appointment.scheduledAt))) as AppointmentRecord[];
  }

  async listForDoctor(doctorProfileId: string, from: Date, to: Date): Promise<AppointmentRecord[]> {
    return (await getDbContext().select(COLUMNS).from(appointment)
      .where(and(eq(appointment.doctorId, doctorProfileId), gte(appointment.scheduledAt, from), lt(appointment.scheduledAt, to)))
      .orderBy(asc(appointment.scheduledAt))) as AppointmentRecord[];
  }

  async listExpiredHolds(doctorProfileId: string, now: Date): Promise<AppointmentRecord[]> {
    return (await getDbContext().select(COLUMNS).from(appointment).where(and(
      eq(appointment.doctorId, doctorProfileId), eq(appointment.status, 'pending_payment'), lte(appointment.paymentHoldExpiresAt, now),
    )).for('update')) as AppointmentRecord[];
  }

  // AP-26 (0014): guarda las dos aceptaciones legales vigentes del paciente. La BD exige ambas o ninguna
  // (appointment_legal_acceptances_chk) y valida paciente, tipo y régimen (gst_appointment_legal_acceptances_check).
  async insert(a: NewAppointment): Promise<void> {
    const db = getDbContext();
    await db.insert(appointment).values({
      id: a.id, patientId: a.patientId, doctorId: a.doctorId, type: 'scheduled', status: 'pending_payment', scheduledAt: a.scheduledAt,
      reason: a.reason, price: a.price, cancellationPolicyId: a.cancellationPolicyId, paymentHoldExpiresAt: a.paymentHoldExpiresAt,
      agendaBlockEndsAt: a.agendaBlockEndsAt,
      privacyLegalAcceptanceId: a.privacyLegalAcceptanceId, termsLegalAcceptanceId: a.termsLegalAcceptanceId,
    });
    await db.insert(appointmentStatusHistory).values({
      appointmentId: a.id, status: 'pending_payment', changedByType: 'patient', changedByUserProfileId: a.createdByUserProfileId, reason: null,
    });
  }

  // DA-6: la cita nueva nace confirmed (la guarda de 0001/0013 solo valida UPDATE). El trigger de 0014 valida que las
  // referencias copiadas sean del mismo paciente, del tipo y del régimen correctos.
  async insertRescheduled(a: RescheduledAppointment): Promise<void> {
    const db = getDbContext();
    await db.insert(appointment).values({
      id: a.id, patientId: a.patientId, doctorId: a.doctorId, type: 'scheduled', status: 'confirmed', scheduledAt: a.scheduledAt,
      reason: a.reason, price: a.price, cancellationPolicyId: a.cancellationPolicyId, paymentHoldExpiresAt: null,
      agendaBlockEndsAt: a.agendaBlockEndsAt, rescheduledFromAppointmentId: a.rescheduledFromAppointmentId,
      privacyLegalAcceptanceId: a.privacyLegalAcceptanceId, termsLegalAcceptanceId: a.termsLegalAcceptanceId,
    });
    await db.insert(appointmentStatusHistory).values({
      appointmentId: a.id, status: 'confirmed', changedByType: 'patient', changedByUserProfileId: a.createdByUserProfileId, reason: 'rescheduled',
    });
  }

  async changeStatus(id: string, change: StatusChange): Promise<void> {
    const db = getDbContext();
    await db.update(appointment).set({
      status: change.status,
      updatedAt: sql`now()`,
      ...(change.cancellation
        ? { cancellationReason: change.cancellation.reason, cancelledByType: change.actorType, cancelledByUserProfileId: change.actorUserProfileId, cancelledAt: change.cancellation.at }
        : {}),
    }).where(eq(appointment.id, id));
    await db.insert(appointmentStatusHistory).values({
      appointmentId: id, status: change.status, changedByType: change.actorType, changedByUserProfileId: change.actorUserProfileId, reason: change.reason,
    });
  }
}
