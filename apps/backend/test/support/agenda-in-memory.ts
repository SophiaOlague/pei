import type { UnitOfWork } from '../../src/common/application/ports/unit-of-work';
import type { Clock } from '../../src/common/application/ports/clock';
import type { AgendaDoctor, AgendaRepository, TimeOffRecord } from '../../src/modules/agenda/application/ports/agenda.repository';
import { sortWindows, type WeeklyWindow } from '../../src/modules/agenda/domain/weekly-schedule';
import type { InMemoryDoctorWorld } from './doctors-world';

// M07: doble en memoria de la agenda, sobre los perfiles de InMemoryDoctorWorld. Registra el orden de candados para
// comprobar que el FOR UPDATE de la agenda se toma antes de la política operativa.
interface AgendaState {
  durations: Record<string, number>;
  availability: Record<string, WeeklyWindow[]>;
  timeOff: TimeOffRecord[];
}

export class InMemoryAgendaRepository implements AgendaRepository {
  state: AgendaState = { durations: {}, availability: {}, timeOff: [] };
  readonly locks: string[] = [];

  constructor(private readonly world: InMemoryDoctorWorld) {}

  private toDoctor(id: string | undefined): AgendaDoctor | null {
    if (!id) return null;
    return { doctorProfileId: id, durationMinutes: this.state.durations[id] ?? 30 };
  }

  async lockDoctorByUserProfileId(userProfileId: string) {
    this.locks.push('agenda:for-update');
    return this.toDoctor(this.world.doctor.profiles.find((p) => p.userProfileId === userProfileId)?.id);
  }
  async findDoctorByUserProfileId(userProfileId: string) {
    return this.toDoctor(this.world.doctor.profiles.find((p) => p.userProfileId === userProfileId)?.id);
  }
  async findDoctorById(id: string) {
    return this.toDoctor(this.world.doctor.profiles.find((p) => p.id === id)?.id);
  }
  async setDuration(id: string, minutes: number) {
    this.state.durations[id] = minutes;
  }
  async listAvailability(id: string) {
    return sortWindows((this.state.availability[id] ?? []).map((w) => ({ ...w })));
  }
  async replaceAvailability(id: string, windows: readonly WeeklyWindow[]) {
    this.state.availability[id] = windows.map((w) => ({ ...w }));
  }
  async listTimeOffEndingAfter(id: string, after: Date) {
    return this.state.timeOff.filter((t) => t.doctorId === id && t.endsAt > after).sort((a, b) => +a.startsAt - +b.startsAt).map((t) => ({ ...t }));
  }
  async listTimeOffOverlapping(id: string, startsAt: Date, endsAt: Date) {
    return this.state.timeOff.filter((t) => t.doctorId === id && t.startsAt < endsAt && t.endsAt > startsAt).map((t) => ({ ...t }));
  }
  async insertTimeOff(record: TimeOffRecord) {
    this.state.timeOff.push({ ...record });
  }
  async findTimeOff(id: string, timeOffId: string) {
    const t = this.state.timeOff.find((r) => r.id === timeOffId && r.doctorId === id);
    return t ? { ...t } : null;
  }
  async deleteTimeOff(id: string, timeOffId: string) {
    this.state.timeOff = this.state.timeOff.filter((r) => !(r.id === timeOffId && r.doctorId === id));
  }

  // Siembra directa (p. ej. un periodo ya terminado, que el caso de uso no permite crear).
  seedTimeOff(record: TimeOffRecord) {
    this.state.timeOff.push(record);
  }
}

// Envuelve la UoW del mundo de médicos y revierte también el estado de la agenda si la transacción falla.
export class InMemoryAgendaUnitOfWork implements UnitOfWork {
  constructor(
    private readonly inner: UnitOfWork,
    private readonly agenda: InMemoryAgendaRepository,
  ) {}
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.agenda.state);
    try {
      return await this.inner.runInTransaction(work);
    } catch (error) {
      this.agenda.state = snapshot;
      throw error;
    }
  }
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
}
