import type { Actor } from '../../src/common/application/actor';
import type { Clock } from '../../src/common/application/ports/clock';
import type { UnitOfWork } from '../../src/common/application/ports/unit-of-work';
import type { AuditTrail } from '../../src/modules/audit/application/ports/audit-trail';
import type { AuditEvent } from '../../src/modules/audit/domain/audit-event';
import type {
  AppointmentRecord, AppointmentRepository, BookableDoctorsReader, BookingEligibility, BookingFeature, CancellationPolicyRepository,
  ConsultationPriceRepository, DoctorSummary, NewAppointment, StatusChange,
} from '../../src/modules/appointments/application/ports/appointments.ports';
import type { PolicyVersion } from '../../src/modules/appointments/domain/cancellation-policy';
import type { PriceVersion } from '../../src/modules/appointments/domain/consultation-price';
import { DomainError } from '../../src/common/domain/domain-error';

// M08: dobles en memoria de los puertos de citas. Registra el orden de candados (DA-2) y revierte el estado completo
// si la unidad de trabajo falla (incluida la auditoría), como la transacción real.

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advanceMinutes(m: number) {
    this.current = new Date(this.current.getTime() + m * 60_000);
  }
}

interface HistoryRow {
  appointmentId: string;
  status: string;
  changedByType: string;
  changedByUserProfileId: string | null;
  reason: string | null;
}

interface State {
  doctors: { id: string; userProfileId: string; durationMinutes: number; firstName: string; lastName: string; specialty: { id: string; name: string } }[];
  patients: { id: string; userProfileId: string }[];
  appointments: AppointmentRecord[];
  history: HistoryRow[];
  prices: PriceVersion[];
  policies: PolicyVersion[];
  audit: AuditEvent[];
}

export class DoctorNotOperationalTestError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('El médico no está aprobado para operar');
  }
}
export class PatientCannotBookTestError extends DomainError {
  readonly kind = 'forbidden' as const;
  constructor() {
    super('Registro incompleto');
  }
}

const clone = <T>(v: T): T => structuredClone(v);

export class InMemoryAppointmentsWorld
  implements AppointmentRepository, ConsultationPriceRepository, BookingEligibility, BookingFeature, BookableDoctorsReader, AuditTrail {
  state: State = { doctors: [], patients: [], appointments: [], history: [], prices: [], policies: [], audit: [] };
  locks: string[] = [];
  operating = new Set<string>();
  blockedPatients = new Set<string>();
  bookingEnabled = true;
  failAuditOnce = false;

  // ---- datos de prueba
  addDoctor(d: { id: string; userProfileId: string; durationMinutes?: number; operating?: boolean; specialty?: { id: string; name: string } }) {
    this.state.doctors.push({
      id: d.id, userProfileId: d.userProfileId, durationMinutes: d.durationMinutes ?? 30, firstName: 'Ana', lastName: `Médica ${this.state.doctors.length + 1}`,
      specialty: d.specialty ?? { id: '00000000-0000-4000-8000-000000000001', name: 'Medicina general' },
    });
    if (d.operating !== false) this.operating.add(d.id);
  }
  addPatient(p: { id: string; userProfileId: string }) {
    this.state.patients.push(p);
  }
  seedAppointment(a: Partial<AppointmentRecord> & { id: string; patientId: string; doctorId: string; scheduledAt: Date; cancellationPolicyId: string }) {
    this.state.appointments.push({
      status: 'confirmed', reason: 'Consulta', price: '200.00', paymentHoldExpiresAt: null, cancellationReason: null, cancelledByType: null,
      cancelledAt: null, createdAt: new Date(0), ...a,
    } as AppointmentRecord);
  }

  // ---- AuditTrail
  async record(event: AuditEvent): Promise<void> {
    if (this.failAuditOnce) {
      this.failAuditOnce = false;
      throw new Error('fallo de auditoría simulado');
    }
    this.state.audit.push(event);
  }

  // ---- BookingEligibility / BookingFeature
  async assertPatientCanBook(actor: Actor) {
    if (actor.userProfileId && this.blockedPatients.has(actor.userProfileId)) throw new PatientCannotBookTestError();
  }
  async assertDoctorCanOperate(id: string) {
    this.locks.push('policy:for-share');
    if (!this.operating.has(id)) throw new DoctorNotOperationalTestError();
  }
  async doctorCanOperate(id: string) {
    return this.operating.has(id);
  }
  enabled() {
    return this.bookingEnabled;
  }

  // ---- BookableDoctorsReader
  async listCandidates(specialtyId?: string): Promise<DoctorSummary[]> {
    return this.state.doctors
      .filter((d) => !specialtyId || d.specialty.id === specialtyId)
      .map((d) => ({ doctorProfileId: d.id, displayName: `${d.firstName} ${d.lastName}`, specialty: d.specialty }));
  }

  // ---- AppointmentRepository
  private doctorRow(d?: State['doctors'][number]) {
    return d ? { doctorProfileId: d.id, durationMinutes: d.durationMinutes } : null;
  }
  async lockDoctorById(id: string) {
    this.locks.push('doctor:for-update');
    return this.doctorRow(this.state.doctors.find((d) => d.id === id));
  }
  async lockDoctorByUserProfileId(u: string) {
    this.locks.push('doctor:for-update');
    return this.doctorRow(this.state.doctors.find((d) => d.userProfileId === u));
  }
  async lockPatientByUserProfileId(u: string) {
    this.locks.push('patient:for-update');
    const p = this.state.patients.find((x) => x.userProfileId === u);
    return p ? { patientProfileId: p.id } : null;
  }
  async findPatientByUserProfileId(u: string) {
    const p = this.state.patients.find((x) => x.userProfileId === u);
    return p ? { patientProfileId: p.id } : null;
  }
  async findDoctorByUserProfileId(u: string) {
    const d = this.state.doctors.find((x) => x.userProfileId === u);
    return d ? { doctorProfileId: d.id } : null;
  }
  async doctorDuration(id: string) {
    return this.state.doctors.find((d) => d.id === id)?.durationMinutes ?? 30;
  }
  async findById(id: string) {
    const a = this.state.appointments.find((x) => x.id === id);
    return a ? clone(a) : null;
  }
  async lockById(id: string) {
    this.locks.push('appointment:for-update');
    return this.findById(id);
  }
  private active = (a: AppointmentRecord) => a.status === 'confirmed' || a.status === 'pending_payment';
  private inRange = (a: AppointmentRecord, from: Date, to: Date) => a.scheduledAt >= from && a.scheduledAt < to;
  async listDoctorCandidatesOverlapping(id: string, from: Date, to: Date) {
    return clone(this.state.appointments.filter((a) => a.doctorId === id && this.active(a) && this.inRange(a, from, to)));
  }
  async listPatientCandidates(id: string, from: Date, to: Date) {
    return clone(this.state.appointments.filter((a) => a.patientId === id && this.active(a) && this.inRange(a, from, to)));
  }
  async listPatientHolds(id: string) {
    return clone(this.state.appointments.filter((a) => a.patientId === id && a.status === 'pending_payment'));
  }
  async listForPatient(id: string) {
    return clone(this.state.appointments.filter((a) => a.patientId === id)).sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  }
  async listForDoctor(id: string, from: Date, to: Date) {
    return clone(this.state.appointments.filter((a) => a.doctorId === id && this.inRange(a, from, to)));
  }
  async listExpiredHolds(id: string, now: Date) {
    return clone(this.state.appointments.filter((a) => a.doctorId === id && a.status === 'pending_payment' && a.paymentHoldExpiresAt! <= now));
  }
  async insert(a: NewAppointment) {
    const { createdByUserProfileId, ...rest } = a;
    this.state.appointments.push({ ...rest, status: 'pending_payment', cancellationReason: null, cancelledByType: null, cancelledAt: null, createdAt: new Date() });
    this.state.history.push({ appointmentId: a.id, status: 'pending_payment', changedByType: 'patient', changedByUserProfileId: createdByUserProfileId, reason: null });
  }
  async changeStatus(id: string, c: StatusChange) {
    const a = this.state.appointments.find((x) => x.id === id)!;
    // Refleja gst_appointment_guard de 0001.
    if (a.status === 'pending_payment' && !['confirmed', 'expired'].includes(c.status)) throw new Error(`trigger: pending_payment → ${c.status}`);
    if (c.status === 'expired' && a.status !== 'pending_payment') throw new Error('trigger: solo pending_payment pasa a expired');
    a.status = c.status;
    if (c.cancellation) {
      a.cancellationReason = c.cancellation.reason;
      a.cancelledByType = c.actorType;
      a.cancelledAt = c.cancellation.at;
    }
    this.state.history.push({ appointmentId: id, status: c.status, changedByType: c.actorType, changedByUserProfileId: c.actorUserProfileId, reason: c.reason });
  }

  // ---- ConsultationPriceRepository
  async lockForPublish() {
    this.locks.push('price:advisory');
  }
  async findEffective(now: Date): Promise<PriceVersion | null> {
    return clone(this.state.prices.find((v) => v.effectiveFrom <= now && (v.effectiveUntil === null || v.effectiveUntil > now)) ?? null);
  }
  async listVersions() {
    return clone(this.state.prices).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  }
  async closeVersion(id: string, at: Date) {
    const v = this.state.prices.find((x) => x.id === id && x.effectiveUntil === null);
    if (v) v.effectiveUntil = at;
  }
  async insertVersion(v: PriceVersion) {
    this.state.prices.push(clone(v));
  }

  // Vista del repositorio de políticas sobre el mismo estado.
  readonly policies: CancellationPolicyRepository = {
    lockForPublish: async () => {
      this.locks.push('policy:advisory');
    },
    findEffective: async (now: Date) =>
      clone(this.state.policies.find((v) => v.effectiveFrom <= now && (v.effectiveUntil === null || v.effectiveUntil > now)) ?? null),
    findById: async (id: string) => clone(this.state.policies.find((v) => v.id === id) ?? null),
    listVersions: async () => clone(this.state.policies).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()),
    closeVersion: async (id: string, at: Date) => {
      const v = this.state.policies.find((x) => x.id === id && x.effectiveUntil === null);
      if (v) v.effectiveUntil = at;
    },
    insertVersion: async (v: PolicyVersion) => {
      this.state.policies.push(clone(v));
    },
  };
}

// Revierte todo el estado si el trabajo o la auditoría fallan.
export class InMemoryAppointmentsUnitOfWork implements UnitOfWork {
  calls = 0;
  constructor(private readonly world: InMemoryAppointmentsWorld) {}
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.calls++;
    const before = structuredClone(this.world.state);
    try {
      return await work();
    } catch (e) {
      this.world.state = before;
      throw e;
    }
  }
}

// Doble de AgendaService.generateSlots: bloques fijos por día local, con la duración del médico.
export class FakeAgendaService {
  // fecha local → lista de inicios ISO UTC
  days: Record<string, string[]> = {};
  constructor(private readonly world: InMemoryAppointmentsWorld) {}
  async generateSlots(doctorProfileId: string, from: string, to: string) {
    const duration = await this.world.doctorDuration(doctorProfileId);
    const slots = Object.entries(this.days)
      .filter(([day]) => day >= from && day <= to)
      .flatMap(([day, starts]) =>
        starts.map((s) => {
          const startsAt = new Date(s);
          const endsAt = new Date(startsAt.getTime() + duration * 60_000);
          return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), date: day, start: '', end: '' };
        }),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { timeZone: 'America/Mexico_City' as const, durationMinutes: duration, from, to, slots };
  }
}
