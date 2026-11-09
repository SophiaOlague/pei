import type { Actor } from '../../../../common/application/actor';
import type { AppointmentStatus } from '../../domain/appointment-status';
import type { PolicyParameters, PolicyVersion } from '../../domain/cancellation-policy';
import type { PriceVersion } from '../../domain/consultation-price';

// M08: puertos de la aplicación de citas. Solo la infraestructura conoce Drizzle y las tablas.

export type ActorType = 'patient' | 'doctor' | 'admin' | 'system';

export interface AppointmentRecord {
  id: string;
  patientId: string;
  doctorId: string;
  status: AppointmentStatus;
  scheduledAt: Date;
  reason: string;
  price: string;
  cancellationPolicyId: string;
  paymentHoldExpiresAt: Date | null;
  cancellationReason: string | null;
  cancelledByType: ActorType | null;
  cancelledAt: Date | null;
  createdAt: Date;
  // DA-3 (0013), NOT NULL desde 0015 (M-1c): fin del bloque de agenda.
  agendaBlockEndsAt: Date;
  // DA-6: cita de la que procede por reagendamiento (null en la raíz de la cadena).
  rescheduledFromAppointmentId: string | null;
  // AP-26 (0014): las dos o ninguna (null en las citas anteriores a 0014).
  privacyLegalAcceptanceId: string | null;
  termsLegalAcceptanceId: string | null;
}

export interface NewAppointment {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledAt: Date;
  reason: string;
  price: string;
  cancellationPolicyId: string;
  paymentHoldExpiresAt: Date;
  // DA-3: scheduledAt + la duración del médico vigente al reservar.
  agendaBlockEndsAt: Date;
  // Primera fila de appointment_status_history (pending_payment, actor patient).
  createdByUserProfileId: string;
  // AP-26 (0014): las dos aceptaciones legales vigentes del paciente al reservar (user_legal_acceptance.id).
  privacyLegalAcceptanceId: string;
  termsLegalAcceptanceId: string;
}

// DA-6 (AP-7): cita nueva de un reagendamiento. Nace confirmed, sin retención ni pago propio (el pago queda en la raíz),
// con el precio, la política, el motivo y las dos referencias legales de la cita original (RN-018, AP-26: se copian,
// no se vuelven a leer; pueden ser las dos nulas si la original es anterior a 0014).
export interface RescheduledAppointment {
  id: string;
  rescheduledFromAppointmentId: string;
  patientId: string;
  doctorId: string;
  scheduledAt: Date;
  // DA-3: nuevo horario + la duración del médico vigente al reagendar.
  agendaBlockEndsAt: Date;
  reason: string;
  price: string;
  cancellationPolicyId: string;
  privacyLegalAcceptanceId: string | null;
  termsLegalAcceptanceId: string | null;
  // Primera fila de appointment_status_history (confirmed, actor patient, motivo 'rescheduled').
  createdByUserProfileId: string;
}

export interface StatusChange {
  status: AppointmentStatus;
  actorType: ActorType;
  actorUserProfileId: string | null;
  reason: string | null;
  // Solo para canceled: se guarda en las columnas de cancelación de la cita.
  cancellation?: { reason: string | null; at: Date };
}

// Orden único de candados (DA-2): doctor_profile FOR UPDATE → patient_profile FOR UPDATE → appointment FOR UPDATE →
// políticas (FOR SHARE dentro de la misma transacción) → cambio → historial → auditoría.
export interface AppointmentRepository {
  lockDoctorById(doctorProfileId: string): Promise<{ doctorProfileId: string; durationMinutes: number } | null>;
  lockDoctorByUserProfileId(userProfileId: string): Promise<{ doctorProfileId: string; durationMinutes: number } | null>;
  lockPatientByUserProfileId(userProfileId: string): Promise<{ patientProfileId: string } | null>;
  findPatientByUserProfileId(userProfileId: string): Promise<{ patientProfileId: string } | null>;
  findDoctorByUserProfileId(userProfileId: string): Promise<{ doctorProfileId: string } | null>;
  findById(id: string): Promise<AppointmentRecord | null>;
  lockById(id: string): Promise<AppointmentRecord | null>;
  // Citas del médico que pueden ocupar horario en el rango (confirmed o pending_payment), sin filtrar la retención.
  listDoctorCandidatesOverlapping(doctorProfileId: string, from: Date, to: Date): Promise<AppointmentRecord[]>;
  listPatientCandidates(patientProfileId: string, from: Date, to: Date): Promise<AppointmentRecord[]>;
  listPatientHolds(patientProfileId: string): Promise<AppointmentRecord[]>;
  listForPatient(patientProfileId: string): Promise<AppointmentRecord[]>;
  listForDoctor(doctorProfileId: string, from: Date, to: Date): Promise<AppointmentRecord[]>;
  // pending_payment con retención vencida de un médico (vencimiento perezoso, DA-9).
  listExpiredHolds(doctorProfileId: string, now: Date): Promise<AppointmentRecord[]>;
  insert(a: NewAppointment): Promise<void>;
  insertRescheduled(a: RescheduledAppointment): Promise<void>;
  changeStatus(id: string, change: StatusChange): Promise<void>;
}
export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');

// Las publicaciones se serializan con un candado transaccional (P-3) y cierran la versión vigente (P-2).
export interface ConsultationPriceRepository {
  lockForPublish(): Promise<void>;
  findEffective(now: Date): Promise<PriceVersion | null>;
  listVersions(): Promise<PriceVersion[]>;
  closeVersion(id: string, at: Date): Promise<void>;
  insertVersion(v: PriceVersion): Promise<void>;
}
export const CONSULTATION_PRICE_REPOSITORY = Symbol('CONSULTATION_PRICE_REPOSITORY');

export interface CancellationPolicyRepository {
  lockForPublish(): Promise<void>;
  findEffective(now: Date): Promise<PolicyVersion | null>;
  findById(id: string): Promise<PolicyVersion | null>;
  listVersions(): Promise<PolicyVersion[]>;
  closeVersion(id: string, at: Date): Promise<void>;
  insertVersion(v: PolicyVersion): Promise<void>;
}
export const CANCELLATION_POLICY_REPOSITORY = Symbol('CANCELLATION_POLICY_REPOSITORY');
export type { PolicyParameters };

// Elegibilidad sin duplicar M02 ni M03: el adaptador delega en CanBookAppointmentsPolicy y DoctorOperationalPolicy.
export interface BookingEligibility {
  assertPatientCanBook(actor: Actor): Promise<void>;
  assertDoctorCanOperate(doctorProfileId: string): Promise<void>;
  doctorCanOperate(doctorProfileId: string): Promise<boolean>;
}
export const BOOKING_ELIGIBILITY = Symbol('BOOKING_ELIGIBILITY');

// AP-26: aceptaciones legales que habilitan la reserva (privacidad y términos vigentes del paciente). El adaptador
// delega en BOOKING_LEGAL_ACCEPTANCE_READER de M02; null si no hay una pareja vigente y completa.
export interface BookingLegalReferences {
  privacyLegalAcceptanceId: string;
  termsLegalAcceptanceId: string;
}
export interface BookingLegalAcceptances {
  currentFor(userProfileId: string): Promise<BookingLegalReferences | null>;
}
export const BOOKING_LEGAL_ACCEPTANCES = Symbol('BOOKING_LEGAL_ACCEPTANCES');

export interface DoctorSummary {
  doctorProfileId: string;
  displayName: string;
  specialty: { id: string; name: string };
}
// Lectura del listado (CC-6): nombre para mostrar y especialidad. Sin CURP, cédula, contacto, biografía ni foto.
export interface BookableDoctorsReader {
  listCandidates(specialtyId?: string): Promise<DoctorSummary[]>;
}
export const BOOKABLE_DOCTORS_READER = Symbol('BOOKABLE_DOCTORS_READER');

// AP-16: la reserva se desactiva en producción hasta integrar y probar pagos.
export interface BookingFeature {
  enabled(): boolean;
}
export const BOOKING_FEATURE = Symbol('BOOKING_FEATURE');
