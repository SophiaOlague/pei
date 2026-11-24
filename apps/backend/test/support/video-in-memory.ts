import type { AfterCommit, AfterCommitAction } from '../../src/common/application/ports/after-commit';
import type { UnitOfWork } from '../../src/common/application/ports/unit-of-work';
import type { Participant, SessionEvent, SessionEventType } from '../../src/modules/video/domain/presence';
import type {
  ActiveMeetingSummary, DoctorOperationalCheck, DoctorOpenSession, DoctorOtherConsultations, IdGenerator, MeetingPatch, MeetingRecord, MeetingRepository,
  VideoProvider,
} from '../../src/modules/video/application/ports/video.ports';
import type { InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld } from './appointments-in-memory';

// Videoconsulta: dobles en memoria. Las citas, médicos y pacientes son los del mundo de M08 (InMemoryAppointmentsWorld);
// las meetings y sus eventos viven aquí y se revierten junto con el mundo si la unidad de trabajo falla.

interface StoredEvent extends SessionEvent {
  meetingId: string;
  seq: number;
}

const clone = <T>(v: T): T => structuredClone(v);

export class InMemoryMeetingRepository implements MeetingRepository {
  state: { meetings: MeetingRecord[]; events: StoredEvent[] } = { meetings: [], events: [] };
  private seq = 0;

  constructor(private readonly world: InMemoryAppointmentsWorld) {}

  async lockDoctorProfile(doctorProfileId: string) {
    this.world.locks.push(`video:doctor:${doctorProfileId}`);
  }
  async findPatientProfileId(userProfileId: string) {
    return this.world.state.patients.find((p) => p.userProfileId === userProfileId)?.id ?? null;
  }
  async findDoctorProfileId(userProfileId: string) {
    return this.world.state.doctors.find((d) => d.userProfileId === userProfileId)?.id ?? null;
  }
  async lockByAppointmentId(appointmentId: string) {
    this.world.locks.push(`video:meeting:${appointmentId}`);
    const m = this.state.meetings.find((x) => x.appointmentId === appointmentId);
    return m ? clone(m) : null;
  }
  async insertIfAbsent(m: { id: string; appointmentId: string; createdAt: Date }) {
    if (this.state.meetings.some((x) => x.appointmentId === m.appointmentId)) return;
    this.state.meetings.push({
      id: m.id, appointmentId: m.appointmentId, roomId: null, status: 'scheduled', startedAt: null, endedAt: null, patientJoinedAt: null,
      doctorJoinedAt: null, patientLastSeenAt: null, doctorLastSeenAt: null, patientProviderParticipantId: null, doctorProviderParticipantId: null,
      createdAt: m.createdAt,
    });
  }
  async update(id: string, patch: MeetingPatch) {
    const m = this.state.meetings.find((x) => x.id === id);
    if (!m) throw new Error(`meeting ${id} no existe`);
    Object.assign(m, clone(patch));
  }
  async appendEvent(e: { meetingId: string; participant: Participant; type: SessionEventType; at: Date }) {
    this.seq += 1;
    this.state.events.push({ meetingId: e.meetingId, participant: e.participant, type: e.type, at: new Date(e.at), seq: this.seq });
  }
  async listEvents(meetingId: string): Promise<SessionEvent[]> {
    return this.eventsOf(meetingId);
  }
  private eventsOf(meetingId: string): SessionEvent[] {
    return this.state.events
      .filter((e) => e.meetingId === meetingId)
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.seq - b.seq)
      .map(({ participant, type, at }) => ({ participant, type, at: new Date(at) }));
  }
  private appointmentOf(m: MeetingRecord) {
    return this.world.state.appointments.find((a) => a.id === m.appointmentId)!;
  }
  async doctorOtherConsultations(doctorProfileId: string, exceptAppointmentId: string, since: Date): Promise<DoctorOtherConsultations> {
    const others = this.state.meetings.filter((m) => {
      const a = this.appointmentOf(m);
      return a.doctorId === doctorProfileId && a.id !== exceptAppointmentId && m.startedAt !== null && (m.status === 'active' || (m.endedAt !== null && m.endedAt > since));
    });
    const ended = others.map((m) => m.endedAt).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime());
    return { active: others.some((m) => m.status === 'active'), lastEndedAt: ended[0] ? new Date(ended[0]) : null };
  }
  async hasOtherActiveMeeting(doctorProfileId: string, exceptAppointmentId: string) {
    return this.state.meetings.some((m) => m.status === 'active' && this.appointmentOf(m).doctorId === doctorProfileId && m.appointmentId !== exceptAppointmentId);
  }
  async listDoctorOpenSessions(doctorProfileId: string): Promise<DoctorOpenSession[]> {
    return this.state.meetings
      .filter((m) => {
        const a = this.appointmentOf(m);
        return a.doctorId === doctorProfileId && (m.status === 'active' || (m.status === 'scheduled' && a.status === 'confirmed'));
      })
      .map((m) => ({ appointmentId: m.appointmentId, scheduledAt: new Date(this.appointmentOf(m).scheduledAt), meeting: clone(m), events: this.eventsOf(m.id) }));
  }
  async listConfirmedAppointmentsDue(now: Date, limit: number) {
    return this.world.state.appointments
      .filter((a) => a.status === 'confirmed' && a.scheduledAt <= now)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, limit)
      .map((a) => a.id);
  }
  async listActiveMeetings(): Promise<ActiveMeetingSummary[]> {
    return this.state.meetings.filter((m) => m.status === 'active' && m.startedAt).map((m) => ({ appointmentId: m.appointmentId, startedAt: new Date(m.startedAt!) }));
  }
}

// Envuelve la unidad de trabajo de M08 para revertir también las meetings si el trabajo falla.
export class VideoTestUnitOfWork implements UnitOfWork, AfterCommit {
  constructor(private readonly inner: InMemoryAppointmentsUnitOfWork, private readonly repo: InMemoryMeetingRepository) {}
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const before = clone(this.repo.state);
    try {
      return await this.inner.runInTransaction(work);
    } catch (error) {
      this.repo.state = before;
      throw error;
    }
  }
  afterCommit(action: AfterCommitAction): void {
    this.inner.afterCommit(action);
  }
}

// Proveedor de video simulado (decisión 13). Solo existe en las pruebas.
export class FakeVideoProvider implements VideoProvider {
  readonly name = 'fake';
  rooms: string[] = [];
  tokens: { roomId: string; participant: Participant; customParticipantId: string; existingParticipantId: string | null }[] = [];
  revoked: { roomId: string; participantId: string }[] = [];
  fail = false;
  async createRoom(input: { appointmentId: string }) {
    if (this.fail) throw new Error('proveedor caído');
    const roomId = `room-${input.appointmentId}`;
    this.rooms.push(roomId);
    return { roomId };
  }
  async issueToken(input: { roomId: string; participant: Participant; customParticipantId: string; existingParticipantId: string | null }) {
    if (this.fail) throw new Error('proveedor caído');
    this.tokens.push(input);
    return { token: `token-${input.customParticipantId}-${this.tokens.length}`, participantId: input.existingParticipantId ?? `participant-${input.customParticipantId}` };
  }
  async revokeAccess(input: { roomId: string; participantId: string }) {
    if (this.fail) throw new Error('proveedor caído');
    this.revoked.push(input);
  }
}

// Habilitación del médico sobre el mismo conjunto que usa M08 (world.operating).
export class WorldDoctorOperationalCheck implements DoctorOperationalCheck {
  constructor(private readonly world: InMemoryAppointmentsWorld) {}
  assertCanOperate(doctorProfileId: string) {
    return this.world.assertDoctorCanOperate(doctorProfileId);
  }
  async canOperate(doctorProfileId: string) {
    return this.world.operating.has(doctorProfileId);
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  newId(): string {
    this.n += 1;
    return `00000000-0000-4000-9000-${String(this.n).padStart(12, '0')}`;
  }
}
