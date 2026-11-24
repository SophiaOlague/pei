import type { Participant, SessionEvent, SessionEventType } from '../../domain/presence';

// Videoconsulta: puertos de la aplicación. Solo la infraestructura conoce Drizzle, las tablas y el proveedor de video.

export type MeetingStatus = 'scheduled' | 'active' | 'ended';

export interface MeetingRecord {
  id: string;
  appointmentId: string;
  // Sala del proveedor: nula hasta que se pide el primer token (0019).
  roomId: string | null;
  status: MeetingStatus;
  // Admisión por el médico (RF-19, RF-22).
  startedAt: Date | null;
  // Finalización por el médico (RF-18, RF-22).
  endedAt: Date | null;
  patientJoinedAt: Date | null;
  doctorJoinedAt: Date | null;
  patientLastSeenAt: Date | null;
  doctorLastSeenAt: Date | null;
  patientProviderParticipantId: string | null;
  doctorProviderParticipantId: string | null;
  createdAt: Date;
}

export type MeetingPatch = Partial<Omit<MeetingRecord, 'id' | 'appointmentId' | 'createdAt'>>;

// Otras consultas del médico que lo ocuparon a partir de la hora programada de esta cita (espera protegida, RF-19).
export interface DoctorOtherConsultations {
  // Tiene otra meeting `active` ahora mismo.
  active: boolean;
  // Fin más reciente de otra consulta que terminó después de la hora programada (F), o null.
  lastEndedAt: Date | null;
}

export interface DoctorOpenSession {
  appointmentId: string;
  scheduledAt: Date;
  meeting: MeetingRecord;
  events: SessionEvent[];
}

export interface ActiveMeetingSummary {
  appointmentId: string;
  startedAt: Date;
}

// Orden de candados, igual que M08 (DA-2): doctor_profile FOR UPDATE → appointment (lo toma M08 al registrar un
// resultado) → meeting FOR UPDATE. Así una operación de sala y una cancelación concurrente se serializan en el médico.
export interface MeetingRepository {
  lockDoctorProfile(doctorProfileId: string): Promise<void>;
  findPatientProfileId(userProfileId: string): Promise<string | null>;
  findDoctorProfileId(userProfileId: string): Promise<string | null>;
  lockByAppointmentId(appointmentId: string): Promise<MeetingRecord | null>;
  // Crea la meeting de la cita si no existe (appointment_id es único: dos entradas simultáneas crean una sola).
  insertIfAbsent(meeting: { id: string; appointmentId: string; createdAt: Date }): Promise<void>;
  update(id: string, patch: MeetingPatch): Promise<void>;
  appendEvent(event: { meetingId: string; participant: Participant; type: SessionEventType; at: Date }): Promise<void>;
  listEvents(meetingId: string): Promise<SessionEvent[]>;
  doctorOtherConsultations(doctorProfileId: string, exceptAppointmentId: string, since: Date): Promise<DoctorOtherConsultations>;
  hasOtherActiveMeeting(doctorProfileId: string, exceptAppointmentId: string): Promise<boolean>;
  listDoctorOpenSessions(doctorProfileId: string): Promise<DoctorOpenSession[]>;
  // Citas confirmed cuya hora programada ya pasó: candidatas a evaluación (barrido del CLI).
  listConfirmedAppointmentsDue(now: Date, limit: number): Promise<string[]>;
  listActiveMeetings(): Promise<ActiveMeetingSummary[]>;
}
export const MEETING_REPOSITORY = Symbol('MEETING_REPOSITORY');

// Proveedor de video (sin confirmar en el Maestro; decisión 13: proveedor simulado en esta entrega). Solo transporta
// audio y video desde la admisión: nunca decide un resultado.
export interface VideoProvider {
  readonly name: string;
  createRoom(input: { appointmentId: string }): Promise<{ roomId: string }>;
  // customParticipantId: identificador estable de PEI, sin datos personales.
  issueToken(input: { roomId: string; participant: Participant; customParticipantId: string; existingParticipantId: string | null }): Promise<{ token: string; participantId: string }>;
  // Revoca el acceso de un participante (decisión 7). Su eficacia sobre una llamada en curso no está verificada.
  revokeAccess(input: { roomId: string; participantId: string }): Promise<void>;
}
export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');

// Habilitación del médico (RN-140, RN-004): DoctorOperationalPolicy de M03.
export interface DoctorOperationalCheck {
  // Lanza DoctorNotOperationalError si el médico no está habilitado (canOperate, D-38).
  assertCanOperate(doctorProfileId: string): Promise<void>;
  // Solo informa (sin lanzar): se usa para auditar la excepción de la decisión 11.
  canOperate(doctorProfileId: string): Promise<boolean>;
}
export const DOCTOR_OPERATIONAL_CHECK = Symbol('DOCTOR_OPERATIONAL_CHECK');

export interface IdGenerator {
  newId(): string;
}
export const VIDEO_ID_GENERATOR = Symbol('VIDEO_ID_GENERATOR');
