import type { AppointmentRecord } from '../ports/appointments.ports';
import {
  auditedHoursBefore,
  CANCELED_APPOINTMENT_NOTICE_VERSION,
  CanceledAppointmentFeedService,
  InvalidCanceledAppointmentCursorError,
  type CanceledAppointmentAuditRow,
  type CanceledAppointmentCursor,
} from './canceled-appointment-feed';

// M08 · A.25 · contrato de la consulta duradera con dobles (sin BD). El lector doble ordena y pagina igual que el de
// Drizzle: (posición con microsegundos, id) estrictamente después del cursor.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pos = (iso: string, us = '000') => iso.replace('Z', `${us}Z`); // 2026-11-20T12:00:00.000Z → …000000Z
const SCHEDULED = new Date('2026-11-25T15:00:00Z');

let seq = 0;
// Fila tal como la deja una cancelación legítima: el historial `canceled` con la MISMA posición que la auditoría (now() de
// la misma transacción) y hoursBefore calculado con el mismo instante que cancelled_at. Cada caso altera solo lo suyo.
function row(
  over: Partial<CanceledAppointmentAuditRow> & { at?: string; us?: string; actor?: 'patient' | 'doctor'; outcome?: string; deadline?: number | null; cancelledAt?: Date } = {},
): CanceledAppointmentAuditRow {
  seq += 1;
  const at = over.at ?? '2026-11-20T12:00:00.000Z';
  const created = new Date(at);
  const position = over.position ?? pos(at, over.us);
  const appointment = over.appointment === undefined
    ? { status: 'canceled', scheduledAt: SCHEDULED, cancelledAt: over.cancelledAt ?? created, cancelledByType: over.actor ?? 'patient', rescheduledFromAppointmentId: null, refundDeadlineHours: over.deadline === undefined ? 24 : over.deadline }
    : over.appointment;
  const auditedAt = appointment?.cancelledAt ?? created;
  return {
    auditId: over.auditId ?? uuid(1000 + seq),
    position,
    auditCreatedAt: created,
    appointmentId: over.appointmentId === undefined ? uuid(seq) : over.appointmentId,
    metadata: over.metadata ?? { actorType: over.actor ?? 'patient', refundOutcome: over.outcome ?? 'full_refund', hoursBefore: auditedHoursBefore(appointment?.scheduledAt ?? SCHEDULED, auditedAt) },
    canceledHistory: over.canceledHistory ?? { count: 1, position },
    appointment,
  };
}

function feed(rows: CanceledAppointmentAuditRow[], chain: Record<string, string | null> = {}) {
  const calls: { after: CanceledAppointmentCursor | null; limit: number }[] = [];
  const key = (r: { position: string; auditId: string }) => `${r.position}|${r.auditId}`;
  const reader = {
    listAfter: async (after: CanceledAppointmentCursor | null, limit: number) => {
      calls.push({ after, limit });
      return [...rows].sort((a, b) => key(a).localeCompare(key(b))).filter((r) => !after || key(r) > key(after)).slice(0, limit);
    },
  };
  const appointments = {
    findById: async (id: string) => (id in chain ? ({ id, rescheduledFromAppointmentId: chain[id] } as AppointmentRecord) : null),
  };
  return { svc: new CanceledAppointmentFeedService(reader, appointments), calls };
}

async function drain(svc: CanceledAppointmentFeedService, limit: number) {
  const all = { items: [] as string[], anomalies: [] as string[], pages: 0 };
  let after: CanceledAppointmentCursor | null = null;
  do {
    const page = await svc.listCanceled({ after, limit });
    all.pages += 1;
    all.items.push(...page.items.map((i) => i.appointmentId));
    all.anomalies.push(...page.anomalies.map((a) => a.reason));
    after = page.next;
  } while (after);
  return all;
}

describe('A.25 CanceledAppointmentFeed · avisos', () => {
  it('cancelación del paciente con full_refund dentro del plazo: aviso con el literal auditado, la raíz y la fecha de la auditoría', async () => {
    const r = row({ at: '2026-11-20T12:00:00.000Z' });
    const page = await feed([r]).svc.listCanceled({ limit: 10 });
    expect(page).toEqual({
      items: [{
        version: CANCELED_APPOINTMENT_NOTICE_VERSION, eventId: `appointment-canceled:${r.appointmentId}`, appointmentId: r.appointmentId, rootAppointmentId: r.appointmentId,
        canceledBy: 'patient', refundOutcome: 'full_refund', occurredAt: '2026-11-20T12:00:00.000Z',
      }],
      anomalies: [],
      next: null,
    });
    // Sin importes, comisiones, motivo ni datos personales.
    expect(Object.keys(page.items[0]).sort()).toEqual(['appointmentId', 'canceledBy', 'eventId', 'occurredAt', 'refundOutcome', 'rootAppointmentId', 'version']);
  });

  it('no_refund (paciente con menos de refund_deadline_hours) y médico (siempre full_refund)', async () => {
    const late = row({ at: '2026-11-25T00:00:00.000Z', outcome: 'no_refund' }); // 15 h antes, plazo 24 h
    const doctor = row({ actor: 'doctor', at: '2026-11-25T14:00:00.000Z', deadline: null });
    const page = await feed([late, doctor]).svc.listCanceled({ limit: 10 });
    expect(page.items.map((i) => [i.canceledBy, i.refundOutcome])).toEqual([['patient', 'no_refund'], ['doctor', 'full_refund']]);
  });

  it('cita reagendada: la raíz se resuelve recorriendo la cadena (DA-6)', async () => {
    const child = row({ appointmentId: uuid(3), appointment: { status: 'canceled', scheduledAt: SCHEDULED, cancelledAt: new Date('2026-11-20T12:00:00Z'), cancelledByType: 'patient', rescheduledFromAppointmentId: uuid(2), refundDeadlineHours: 24 } });
    const page = await feed([child], { [uuid(2)]: uuid(1), [uuid(1)]: null }).svc.listCanceled({ limit: 10 });
    expect(page.items[0]).toMatchObject({ appointmentId: uuid(3), rootAppointmentId: uuid(1) });
  });

  it('cancelaciones antiguas (años atrás): sin horizonte, se recuperan igual', async () => {
    const old = row({ at: '2019-01-05T08:00:00.000Z', appointment: { status: 'canceled', scheduledAt: new Date('2019-02-01T00:00:00Z'), cancelledAt: new Date('2019-01-05T08:00:00Z'), cancelledByType: 'patient', rescheduledFromAppointmentId: null, refundDeadlineHours: 24 } });
    expect((await drain(feed([old, row()]).svc, 1)).items).toEqual([old.appointmentId, expect.any(String)]);
  });
});

describe('A.25 CanceledAppointmentFeed · paginación por clave estable', () => {
  it('recorre todo sin omitir ni repetir, con filas del mismo milisegundo a ambos lados del corte', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => row({ at: '2026-11-20T12:00:00.123Z', us: String(i < 4 ? 456 : 457).padStart(3, '0') }));
    const { svc, calls } = feed(rows);
    const all = await drain(svc, 3);
    expect(all.items.sort()).toEqual(rows.map((r) => r.appointmentId!).sort());
    expect(new Set(all.items).size).toBe(7);
    expect(all.pages).toBe(3);
    expect(calls.map((c) => c.limit)).toEqual([3, 3, 3]);
  });

  it('las anomalías cuentan para la página (el cursor avanza por ellas; no se pierde lo que hay detrás)', async () => {
    const rows = [row({ outcome: 'basura' }), row({ outcome: 'basura' }), row()];
    const all = await drain(feed(rows).svc, 2);
    expect(all).toMatchObject({ items: [rows[2].appointmentId], anomalies: ['invalid_audit_metadata', 'invalid_audit_metadata'] });
  });

  it('sin cursor persistente: una transacción que confirma tarde con una posición anterior aparece en el siguiente barrido completo', async () => {
    const rows = [row({ at: '2026-11-20T12:00:05.000Z' })];
    const { svc } = feed(rows);
    expect((await drain(svc, 10)).items).toHaveLength(1);
    rows.push(row({ at: '2026-11-20T12:00:01.000Z' })); // empezó antes, confirmó después
    expect((await drain(svc, 10)).items).toHaveLength(2);
  });

  it('valida el cursor y el límite', async () => {
    const { svc } = feed([]);
    await expect(svc.listCanceled({ after: { position: '2026-11-20T12:00:00.000Z', auditId: uuid(1) }, limit: 10 })).rejects.toBeInstanceOf(InvalidCanceledAppointmentCursorError);
    await expect(svc.listCanceled({ after: { position: '2026-11-20T12:00:00.000000Z', auditId: 'x' }, limit: 10 })).rejects.toBeInstanceOf(InvalidCanceledAppointmentCursorError);
    await expect(svc.listCanceled({ limit: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(svc.listCanceled({ limit: 501 })).rejects.toBeInstanceOf(RangeError);
  });

  it('un error de lectura de la cadena se propaga (el barrido falla y se reintenta; nunca se salta la fila)', async () => {
    const child = row({ appointment: { status: 'canceled', scheduledAt: SCHEDULED, cancelledAt: new Date('2026-11-20T12:00:00Z'), cancelledByType: 'patient', rescheduledFromAppointmentId: uuid(99), refundDeadlineHours: 24 } });
    const svc = new CanceledAppointmentFeedService({ listAfter: async () => [child] }, { findById: async () => Promise.reject(new Error('conexión perdida')) });
    await expect(svc.listCanceled({ limit: 10 })).rejects.toThrow('conexión perdida');
  });
});

describe('A.25 CanceledAppointmentFeed · discrepancias (excluidas como anomalía)', () => {
  const base = { status: 'canceled', scheduledAt: SCHEDULED, cancelledAt: new Date('2026-11-20T12:00:00Z'), cancelledByType: 'patient', rescheduledFromAppointmentId: null, refundDeadlineHours: 24 };
  const hb = (cancelledAt: Date) => auditedHoursBefore(SCHEDULED, cancelledAt);
  it.each([
    // refundOutcome inconsistente con las reglas de M08.
    ['literal full_refund pero las reglas dan no_refund', row({ at: '2026-11-25T00:00:00.000Z' }), 'outcome_mismatch'],
    ['literal no_refund pero las reglas dan full_refund', row({ outcome: 'no_refund' }), 'outcome_mismatch'],
    ['médico con no_refund', row({ actor: 'doctor', outcome: 'no_refund' }), 'outcome_mismatch'],
    // Metadata.
    ['metadata sin refundOutcome', row({ metadata: { actorType: 'patient', hoursBefore: 123 } }), 'invalid_audit_metadata'],
    ['metadata sin hoursBefore', row({ metadata: { actorType: 'patient', refundOutcome: 'full_refund' } }), 'invalid_audit_metadata'],
    ['hoursBefore no numérico', row({ metadata: { actorType: 'patient', refundOutcome: 'full_refund', hoursBefore: '123' } }), 'invalid_audit_metadata'],
    ['metadata no objeto', row({ metadata: 'x' }), 'invalid_audit_metadata'],
    ['fila sin entity_id', row({ appointmentId: null }), 'invalid_audit_metadata'],
    // Cita.
    ['cita inexistente', row({ appointment: null }), 'appointment_missing'],
    ['cita que no está canceled', row({ appointment: { ...base, status: 'completed' } }), 'status_mismatch'],
    ['actor distinto', row({ appointment: { ...base, cancelledByType: 'doctor' } }), 'actor_mismatch'],
    ['sin cancelled_at', row({ appointment: { ...base, cancelledAt: null } }), 'cancelled_at_missing'],
    // Misma transacción: audit_log.created_at frente al historial (igualdad exacta).
    ['sin fila canceled en el historial', row({ canceledHistory: { count: 0, position: null } }), 'history_missing'],
    ['dos filas canceled en el historial', row({ canceledHistory: { count: 2, position: pos('2026-11-20T12:00:00.000Z') } }), 'history_ambiguous'],
    ['historial 1 µs después de la auditoría', row({ canceledHistory: { count: 1, position: '2026-11-20T12:00:00.000001Z' } }), 'history_time_mismatch'],
    ['historial de otra transacción (1 s antes)', row({ canceledHistory: { count: 1, position: '2026-11-20T11:59:59.000000Z' } }), 'history_time_mismatch'],
    // Integridad de cancelled_at frente a hoursBefore (mismo `now` de la aplicación).
    ['cancelled_at alterado después (1 min)', row({ metadata: { actorType: 'patient', refundOutcome: 'full_refund', hoursBefore: hb(base.cancelledAt) }, appointment: { ...base, cancelledAt: new Date(base.cancelledAt.getTime() + 60_000) } }), 'hours_before_mismatch'],
    ['cancelled_at alterado para cruzar el plazo (no_refund → full_refund)', row({ at: '2026-11-24T16:00:00.000Z', outcome: 'no_refund', metadata: { actorType: 'patient', refundOutcome: 'no_refund', hoursBefore: hb(new Date('2026-11-24T16:00:00Z')) }, appointment: { ...base, cancelledAt: new Date('2026-11-24T14:00:00Z') } }), 'hours_before_mismatch'],
    ['hoursBefore inconsistente (0.01 h de diferencia)', row({ metadata: { actorType: 'patient', refundOutcome: 'full_refund', hoursBefore: hb(base.cancelledAt) + 0.01 } }), 'hours_before_mismatch'],
    // Política y cadena.
    ['política inexistente', row({ appointment: { ...base, refundDeadlineHours: null } }), 'policy_missing'],
    ['cadena rota', row({ appointment: { ...base, rescheduledFromAppointmentId: uuid(77) } }), 'chain_broken'],
  ])('%s', async (_n, r, reason) => {
    const page = await feed([r]).svc.listCanceled({ limit: 10 });
    expect(page.items).toEqual([]);
    expect(page.anomalies).toEqual([{ eventId: r.appointmentId ? `appointment-canceled:${r.appointmentId}` : `appointment-canceled:audit-${r.auditId}`, appointmentId: r.appointmentId, auditId: r.auditId, occurredAt: r.auditCreatedAt.toISOString(), reason }]);
  });
});

describe('A.25 CanceledAppointmentFeed · sin falsos positivos en cancelaciones legítimas', () => {
  it('auditoría e historial idénticos al microsegundo: aviso', async () => {
    const r = row({ at: '2026-11-20T12:00:00.123Z', us: '456' });
    expect(r.canceledHistory.position).toBe('2026-11-20T12:00:00.123456Z');
    expect((await feed([r]).svc.listCanceled({ limit: 10 })).items).toHaveLength(1);
  });

  it.each([
    ['10 min después del inicio de la transacción (espera de candados)', 10 * 60_000],
    ['3 h después (reloj de la aplicación adelantado)', 3 * 3_600_000],
    ['2 min ANTES (reloj de la aplicación atrasado)', -2 * 60_000],
  ])('cancelled_at %s: ya no hay comparación entre relojes, no es anomalía', async (_n, offset) => {
    const r = row({ cancelledAt: new Date(Date.parse('2026-11-20T12:00:00Z') + offset) });
    const page = await feed([r]).svc.listCanceled({ limit: 10 });
    expect(page.anomalies).toEqual([]);
    expect(page.items).toHaveLength(1);
  });

  it('cancelación después del inicio de la cita (hoursBefore negativo, y −0 frente a 0 de JSON)', async () => {
    const late = row({ outcome: 'no_refund', cancelledAt: new Date(SCHEDULED.getTime() + 3 * 3_600_000) });
    const justAfter = row({ outcome: 'no_refund', cancelledAt: new Date(SCHEDULED.getTime() + 10_000) });
    expect(auditedHoursBefore(SCHEDULED, new Date(SCHEDULED.getTime() + 10_000))).toBe(-0);
    // La auditoría guarda JSON: −0 se serializa como 0.
    (justAfter.metadata as { hoursBefore: number }).hoursBefore = JSON.parse(JSON.stringify(-0));
    const page = await feed([late, justAfter]).svc.listCanceled({ limit: 10 });
    expect(page.anomalies).toEqual([]);
    expect(page.items.map((i) => i.refundOutcome)).toEqual(['no_refund', 'no_refund']);
  });

  it('hoursBefore con decimales tras el viaje por JSON (jsonb) sigue siendo exacto', async () => {
    const cancelledAt = new Date('2026-11-20T12:00:07.123Z');
    const r = row({ cancelledAt });
    (r.metadata as { hoursBefore: number }).hoursBefore = JSON.parse(JSON.stringify(auditedHoursBefore(SCHEDULED, cancelledAt)));
    expect((await feed([r]).svc.listCanceled({ limit: 10 })).items).toHaveLength(1);
  });
});
