import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TRIPWIRE_MARK } from '../../test/support/db-tripwire';
import { EvaluateSessionsUseCase } from '../modules/video/application/use-cases/evaluate-sessions.use-case';
import { ReconcileNoShowRefundsUseCase } from '../modules/payments/application/use-cases/reconcile-no-show-refunds.use-case';
import { formatEvaluationSummary, VideoCliModule } from './video-evaluate-sessions';
import { formatNoShowReconcileSummary } from './payments-reconcile-no-shows';
import { PaymentsCliModule } from './payments-retry-webhooks';

// Sin ejecutar los CLI: los contextos compilan sin conectar (db-tripwire cuenta cualquier intento) y los resúmenes solo
// tienen conteos e ids técnicos. Ejecutarlos de verdad escribe en la BD y requiere autorización (y 0019 aplicada).
const attempts = () => (globalThis as Record<symbol, number>)[TRIPWIRE_MARK] ?? 0;

describe('CLI de videoconsulta', () => {
  afterEach(() => jest.restoreAllMocks());

  it('[TC-VID-180] los contextos resuelven el barrido de evaluación y el de reembolsos por inasistencia sin conectar', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const before = attempts();
    const video = await Test.createTestingModule({ imports: [VideoCliModule] }).compile();
    const payments = await Test.createTestingModule({ imports: [PaymentsCliModule] }).compile();
    try {
      expect(video.get(EvaluateSessionsUseCase, { strict: false })).toBeInstanceOf(EvaluateSessionsUseCase);
      expect(payments.get(ReconcileNoShowRefundsUseCase, { strict: false })).toBeInstanceOf(ReconcileNoShowRefundsUseCase);
    } finally {
      await video.close();
      await payments.close();
    }
    expect(attempts()).toBe(before);
  });

  it('[TC-VID-181][decisión 12] el resumen de evaluación informa pendientes y consultas activas sin tratarlos como error', () => {
    const r = formatEvaluationSummary({
      examined: 3, determined: { both: 1 }, waiting: 0, started: 1,
      pending: [{ appointmentId: 'apt-a', reason: 'no_rule', since: '2026-11-20T16:30:00.000Z' }],
      activeConsultations: [{ appointmentId: 'apt-b', startedAt: '2026-11-17T16:00:00.000Z' }], errors: [],
    });
    expect(r.exitCode).toBe(0);
    expect(r.lines[0]).toBe('Citas examinadas: 3; inasistencias registradas: both: 1; en espera: 0; con consulta iniciada: 1; pendientes de definición: 1; con error: 0');
    expect(r.lines.join('\n')).toMatch(/apt-a=no_rule/);
    expect(r.lines.join('\n')).toMatch(/Consultas activas sin finalizar \(no se cierran solas\): apt-b desde 2026-11-17T16:00:00.000Z/);
    expect(formatEvaluationSummary({ examined: 1, determined: {}, waiting: 0, started: 0, pending: [], activeConsultations: [], errors: ['apt-c'] }).exitCode).toBe(1);
  });

  it('[TC-VID-182] el resumen de reembolsos por inasistencia: código 1 con anomalías, errores o barrido incompleto', () => {
    const ok = { pages: 1, examined: 2, byOutcome: { requested: 1, no_refund: 1 }, awaitingApproval: 0, anomalies: 0, anomalySample: [], errorSample: [], complete: true };
    expect(formatNoShowReconcileSummary(ok)).toEqual({ lines: ['Resultados examinados: 2 en 1 página(s); no_refund: 1; requested: 1; esperan aprobación: 0; anomalías: 0'], exitCode: 0 });
    expect(formatNoShowReconcileSummary({ ...ok, complete: false }).exitCode).toBe(1);
    expect(formatNoShowReconcileSummary({ ...ok, byOutcome: { error: 1 } }).exitCode).toBe(1);
  });
});
