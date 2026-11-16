import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { FixedClock, InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld } from '../../../../../test/support/appointments-in-memory';
import { INITIAL_POLICY } from '../../domain/cancellation-policy';
import { APPOINTMENT_AUDIT_ACTIONS } from '../appointments-audit-events';
import { CancelByDoctorUseCase, CancelByPatientUseCase } from '../use-cases/cancellation.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from '../use-cases/configuration.use-cases';
import { CanceledAppointmentFeedService, type CanceledAppointmentAuditRow } from './canceled-appointment-feed';

// M08 · A.25 · contrato entre los casos de uso REALES de cancelación (paciente y médico) y la verificación exacta de la
// consulta duradera. Sin BD: el mundo en memoria de M08 guarda lo que la transacción persiste (cita, auditoría). La fila
// del lector se arma con esos datos; now() de PostgreSQL (auditoría e historial, misma transacción) se simula con un
// instante DISTINTO del reloj de la aplicación, para mostrar que la verificación no compara relojes.
// Demuestra que auditedHoursBefore reproduce exactamente el hoursBefore que audita cancellation.use-cases.ts.

const actor = (role: 'patient' | 'doctor' | 'admin', userProfileId: string = randomUUID()): Actor => ({
  userId: `u-${userProfileId}`, userProfileId, role, ipAddress: '203.0.113.9', userAgent: 'PEI-A25-contract',
});

async function setup(now: Date) {
  const world = new InMemoryAppointmentsWorld();
  const uow = new InMemoryAppointmentsUnitOfWork(world);
  const clock = new FixedClock(now);
  const admin = actor('admin');
  await new ConsultationPriceService(uow, world, world, clock).publish(admin, '200.00', 'initial_setup');
  const policies = new CancellationPolicyService(uow, world, world.policies, clock);
  await policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  const policyId = (await policies.current(admin)).id;
  const doctor = actor('doctor');
  const doctorId = randomUUID();
  world.addDoctor({ id: doctorId, userProfileId: doctor.userProfileId! });
  const patient = actor('patient');
  const patientId = randomUUID();
  world.addPatient({ id: patientId, userProfileId: patient.userProfileId! });
  const confirmed = (scheduledAt: Date) => {
    const id = randomUUID();
    world.seedAppointment({ id, patientId, doctorId, scheduledAt, cancellationPolicyId: policyId, privacyLegalAcceptanceId: 'p', termsLegalAcceptanceId: 't' });
    return id;
  };
  return {
    world, clock, doctor, patient, confirmed,
    cancelPatient: new CancelByPatientUseCase(uow, world, world, world.policies, clock, uow.events),
    cancelDoctor: new CancelByDoctorUseCase(uow, world, world, world, clock, uow.events),
  };
}

// Lo que leería el lector Drizzle tras el COMMIT. dbNow simula now() de PostgreSQL (mismo valor en audit_log y en
// appointment_status_history por ser la misma transacción).
async function readerRow(env: Awaited<ReturnType<typeof setup>>, appointmentId: string, dbNow: Date): Promise<CanceledAppointmentAuditRow> {
  const audit = env.world.state.audit.find((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.canceled && e.entityId === appointmentId)!;
  const a = (await env.world.findById(appointmentId))!;
  const position = dbNow.toISOString().replace('Z', '321Z');
  return {
    auditId: randomUUID(), position, auditCreatedAt: dbNow, appointmentId, metadata: JSON.parse(JSON.stringify(audit.metadata)),
    canceledHistory: { count: 1, position },
    appointment: { status: a.status, scheduledAt: a.scheduledAt, cancelledAt: a.cancelledAt, cancelledByType: a.cancelledByType, rescheduledFromAppointmentId: a.rescheduledFromAppointmentId, refundDeadlineHours: INITIAL_POLICY.refundDeadlineHours },
  };
}

const feedOf = (env: Awaited<ReturnType<typeof setup>>, rows: CanceledAppointmentAuditRow[]) =>
  new CanceledAppointmentFeedService({ listAfter: async () => rows }, { findById: (id) => env.world.findById(id) });

describe('A.25 · contrato con los casos de uso de cancelación reales', () => {
  const NOW = new Date('2026-11-14T10:17:43.219Z');

  it.each([
    ['paciente con anticipación (full_refund)', 'patient', 72 * 3_600_000 + 1_234],
    ['paciente fuera de plazo (no_refund)', 'patient', 5 * 3_600_000 + 17_891],
    ['paciente en el límite exacto del plazo (full_refund)', 'patient', 24 * 3_600_000],
    ['paciente 1 ms antes del límite (no_refund)', 'patient', 24 * 3_600_000 - 1],
    ['médico (siempre full_refund)', 'doctor', 30 * 60_000 + 999],
  ] as const)('%s: el aviso pasa la verificación exacta sin falsos positivos', async (_n, by, aheadMs) => {
    const env = await setup(NOW);
    const id = env.confirmed(new Date(NOW.getTime() + aheadMs));
    const result = by === 'patient'
      ? await env.cancelPatient.execute(env.patient, id, 'motivo')
      : await env.cancelDoctor.execute(env.doctor, id, 'Emergencia médica en el hospital');
    // now() de la BD distinto del reloj de la aplicación (inicio de la transacción 7 min antes): no importa.
    const page = await feedOf(env, [await readerRow(env, id, new Date(NOW.getTime() - 7 * 60_000))]).listCanceled({ limit: 10 });
    expect(page.anomalies).toEqual([]);
    expect(page.items).toEqual([expect.objectContaining({ appointmentId: id, canceledBy: by, refundOutcome: result.refundOutcome })]);
  });

  it('si después se altera cancelled_at, la verificación lo detecta (hours_before_mismatch)', async () => {
    const env = await setup(NOW);
    const id = env.confirmed(new Date(NOW.getTime() + 72 * 3_600_000));
    await env.cancelPatient.execute(env.patient, id, null);
    const row = await readerRow(env, id, NOW);
    row.appointment = { ...row.appointment!, cancelledAt: new Date(row.appointment!.cancelledAt!.getTime() + 60_000) };
    expect((await feedOf(env, [row]).listCanceled({ limit: 10 })).anomalies.map((a) => a.reason)).toEqual(['hours_before_mismatch']);
  });

  it('si el historial no es de la misma transacción, la verificación lo detecta (history_time_mismatch)', async () => {
    const env = await setup(NOW);
    const id = env.confirmed(new Date(NOW.getTime() + 72 * 3_600_000));
    await env.cancelDoctor.execute(env.doctor, id, 'Emergencia médica en el hospital');
    const row = await readerRow(env, id, NOW);
    row.canceledHistory = { count: 1, position: row.position.replace('321Z', '322Z') };
    expect((await feedOf(env, [row]).listCanceled({ limit: 10 })).anomalies.map((a) => a.reason)).toEqual(['history_time_mismatch']);
  });
});
