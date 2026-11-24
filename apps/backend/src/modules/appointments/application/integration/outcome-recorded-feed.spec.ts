import { readFileSync } from 'fs';
import { join } from 'path';
import type { AppointmentRecord } from '../ports/appointments.ports';
import {
  InvalidOutcomeRecordedCursorError,
  OUTCOME_RECORDED_NOTICE_VERSION,
  OutcomeRecordedFeedService,
  type OutcomeRecordedAuditRow,
  type OutcomeRecordedCursor,
} from './outcome-recorded-feed';

// Consulta duradera de resultados (decisión 10) con dobles, sin BD. El lector doble ordena y pagina como el de Drizzle.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pos = (iso: string) => iso.replace('Z', '000Z');
let seq = 0;

function row(over: Partial<OutcomeRecordedAuditRow> & { status?: string; outcome?: string; at?: string } = {}): OutcomeRecordedAuditRow {
  seq += 1;
  const at = over.at ?? '2026-11-20T12:00:00.000Z';
  const position = over.position ?? pos(at);
  const status = over.status ?? 'no_show_doctor';
  return {
    auditId: over.auditId ?? uuid(1000 + seq),
    position,
    auditCreatedAt: new Date(at),
    appointmentId: over.appointmentId === undefined ? uuid(seq) : over.appointmentId,
    metadata: over.metadata ?? { status, refundOutcome: over.outcome ?? (status === 'no_show_doctor' || status === 'no_show_both' ? 'full_refund' : 'no_refund') },
    statusHistory: over.statusHistory ?? { count: 1, position },
    appointment: over.appointment === undefined ? { status, rescheduledFromAppointmentId: null } : over.appointment,
  };
}

function feed(rows: OutcomeRecordedAuditRow[], chain: Record<string, string | null> = {}) {
  const key = (r: { position: string; auditId: string }) => `${r.position}|${r.auditId}`;
  const reader = {
    listAfter: async (after: OutcomeRecordedCursor | null, limit: number) =>
      [...rows].sort((a, b) => key(a).localeCompare(key(b))).filter((r) => !after || key(r) > key(after)).slice(0, limit),
  };
  const appointments = { findById: async (id: string) => (id in chain ? ({ id, rescheduledFromAppointmentId: chain[id] } as AppointmentRecord) : null) };
  return new OutcomeRecordedFeedService(reader, appointments);
}

describe('Consulta duradera de resultados (OutcomeRecordedFeedService)', () => {
  it('[TC-VID-110] entrega cada resultado verificado con su refundOutcome y la raíz de la cadena', async () => {
    const root = uuid(900);
    const r = row({ status: 'no_show_both', appointment: { status: 'no_show_both', rescheduledFromAppointmentId: root } });
    const page = await feed([r], { [root]: null }).listOutcomes({ limit: 10 });
    expect(page.anomalies).toEqual([]);
    expect(page.items).toEqual([{
      version: OUTCOME_RECORDED_NOTICE_VERSION, eventId: `appointment-outcome:${r.appointmentId}`, appointmentId: r.appointmentId, rootAppointmentId: root,
      status: 'no_show_both', refundOutcome: 'full_refund', occurredAt: '2026-11-20T12:00:00.000Z',
    }]);
  });

  it.each<[string, Partial<OutcomeRecordedAuditRow> & { status?: string; outcome?: string }]>([
    ['invalid_audit_metadata', { metadata: { status: 'no_show_doctor' } }],
    ['invalid_audit_metadata', { metadata: { status: 'canceled', refundOutcome: 'full_refund' } }],
    ['appointment_missing', { appointment: null }],
    ['status_mismatch', { status: 'no_show_doctor', appointment: { status: 'confirmed', rescheduledFromAppointmentId: null } }],
    ['history_missing', { statusHistory: { count: 0, position: null } }],
    ['history_ambiguous', { statusHistory: { count: 2, position: pos('2026-11-20T12:00:00.000Z') } }],
    ['history_time_mismatch', { statusHistory: { count: 1, position: pos('2026-11-20T12:00:01.000Z') } }],
    ['outcome_mismatch', { status: 'no_show_patient', outcome: 'full_refund' }],
    ['chain_broken', { appointment: { status: 'no_show_doctor', rescheduledFromAppointmentId: uuid(999) } }],
  ])('[TC-VID-111] una fila que no cuadra se excluye como anomalía (%s), nunca se entrega', async (reason, over) => {
    const page = await feed([row(over)]).listOutcomes({ limit: 10 });
    expect(page.items).toEqual([]);
    expect(page.anomalies.map((a) => a.reason)).toEqual([reason]);
  });

  it('[TC-VID-112] pagina por (posición, id) y valida el cursor', async () => {
    const rows = [row({ at: '2026-11-20T12:00:00.000Z' }), row({ at: '2026-11-20T12:00:01.000Z' }), row({ at: '2026-11-20T12:00:02.000Z' })];
    const svc = feed(rows);
    const first = await svc.listOutcomes({ limit: 2 });
    expect(first.items).toHaveLength(2);
    const second = await svc.listOutcomes({ after: first.next, limit: 2 });
    expect(second.items.map((i) => i.appointmentId)).toEqual([rows[2].appointmentId]);
    expect(second.next).toBeNull();
    await expect(svc.listOutcomes({ after: { position: 'x', auditId: 'y' }, limit: 2 })).rejects.toThrow(InvalidOutcomeRecordedCursorError);
    await expect(svc.listOutcomes({ limit: 0 })).rejects.toThrow(RangeError);
  });

  it('[TC-VID-113] arquitectura: sin ruta HTTP, lector de solo lectura y registrado en AppointmentsModule', () => {
    const base = join(__dirname, '..', '..');
    const controllers = readFileSync(join(base, 'presentation', 'appointments.controllers.ts'), 'utf8');
    expect(controllers).not.toContain('OutcomeRecordedFeed');
    const reader = readFileSync(join(base, 'infrastructure', 'persistence', 'drizzle-outcome-recorded-audit.reader.ts'), 'utf8');
    expect(reader).not.toMatch(/\.(insert|update|delete)\(/);
    const module = readFileSync(join(base, 'appointments.module.ts'), 'utf8');
    expect(module).toMatch(/exports: \[[^\]]*OutcomeRecordedFeedService/);
    const contract = readFileSync(join(__dirname, 'outcome-recorded-feed.ts'), 'utf8');
    expect(contract).not.toMatch(/\b(amount|price|gross|fee)\b/);
  });
});
