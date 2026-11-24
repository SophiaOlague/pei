import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import type { NoShowOutcome, PendingReason } from '../../domain/no-show-evaluator';
import { MEETING_REPOSITORY, type MeetingRepository } from '../ports/video.ports';
import { SessionEngine } from '../session-engine';

// Barrido de evaluación (CLI video-evaluate-sessions; sin planificador). Evalúa las citas confirmed cuya hora ya pasó con
// el MISMO motor que las operaciones de sala: lo que una regla determina se registra en M08; lo pendiente solo se
// informa. Repetirlo no duplica nada (markNoShow es idempotente y la evaluación es histórica).
// También lista las consultas activas, con su hora de inicio y sin aplicar ningún plazo (decisión 12).

export const EVALUATE_DEFAULT_LIMIT = 500;

export interface EvaluationSweepSummary {
  examined: number;
  determined: Partial<Record<NoShowOutcome, number>>;
  waiting: number;
  started: number;
  // Casos sin regla en el Maestro: la cita sigue confirmed.
  pending: { appointmentId: string; reason: PendingReason; since: string }[];
  activeConsultations: { appointmentId: string; startedAt: string }[];
  errors: string[];
}

@Injectable()
export class EvaluateSessionsUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(MEETING_REPOSITORY) private readonly meetings: MeetingRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly engine: SessionEngine,
  ) {}

  async execute(options: { limit?: number } = {}): Promise<EvaluationSweepSummary> {
    const summary: EvaluationSweepSummary = { examined: 0, determined: {}, waiting: 0, started: 0, pending: [], activeConsultations: [], errors: [] };
    const ids = await this.meetings.listConfirmedAppointmentsDue(this.clock.now(), options.limit ?? EVALUATE_DEFAULT_LIMIT);
    for (const appointmentId of ids) {
      summary.examined += 1;
      try {
        // Proceso del sistema: no hay actor que autorizar.
        const ctx = await this.uow.runInTransaction(() => this.engine.open(appointmentId, () => undefined));
        const e = ctx.evaluation;
        if (!e || e.kind === 'waiting') summary.waiting += 1;
        else if (e.kind === 'started') summary.started += 1;
        else if (e.kind === 'determined') summary.determined[e.outcome] = (summary.determined[e.outcome] ?? 0) + 1;
        else summary.pending.push({ appointmentId, reason: e.reason, since: e.since.toISOString() });
      } catch {
        // Un error en una cita no detiene el barrido; el siguiente la reintenta. Solo se informa el id técnico.
        summary.errors.push(appointmentId);
      }
    }
    summary.activeConsultations = (await this.meetings.listActiveMeetings()).map((m) => ({ appointmentId: m.appointmentId, startedAt: m.startedAt.toISOString() }));
    return summary;
  }
}
