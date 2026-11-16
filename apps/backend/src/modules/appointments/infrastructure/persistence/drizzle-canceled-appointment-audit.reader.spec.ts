import { canceledAuditQuery, toCanceledAuditRow } from './drizzle-canceled-appointment-audit.reader';

// M08 · A.25 · SQL generado por el lector (sin ejecutar: toSQL no abre conexión; db-tripwire lo vigilaría). El
// comportamiento sobre PostgreSQL real (orden con microsegundos, LEFT JOIN) queda pendiente de C2.
describe('DrizzleCanceledAppointmentAuditReader', () => {
  it('solo lectura: SELECT de la acción de cancelación, LEFT JOIN de cita y política, orden (created_at, id) y límite', () => {
    const { sql, params } = canceledAuditQuery(null, 50).toSQL();
    expect(sql).toMatch(/^select /);
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(sql).toMatch(/left join "appointment"/);
    expect(sql).toMatch(/left join "cancellation_policy"/);
    expect(sql).toMatch(/order by "audit_log"\."created_at" asc, "audit_log"\."id" asc limit \$\d/);
    expect(sql).toMatch(/to_char\("audit_log"\."created_at" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.US"Z"'\)/);
    expect(params).toEqual(expect.arrayContaining(['appointment.status.canceled', 'appointment', 50]));
  });

  it('con cursor: comparación de filas (created_at, id) > (posición exacta, id)', () => {
    const { sql, params } = canceledAuditQuery({ position: '2026-11-20T12:00:00.123456Z', auditId: '00000000-0000-4000-8000-000000000001' }, 10).toSQL();
    expect(sql).toMatch(/\("audit_log"\."created_at", "audit_log"\."id"\) > \(\$\d+::timestamptz, \$\d+::uuid\)/);
    expect(params).toEqual(expect.arrayContaining(['2026-11-20T12:00:00.123456Z', '00000000-0000-4000-8000-000000000001']));
  });

  it('una fila de auditoría sin cita (LEFT JOIN vacío) se conserva con appointment = null', () => {
    const at = new Date('2026-11-20T12:00:00Z');
    expect(toCanceledAuditRow({
      auditId: 'a', position: 'p', auditCreatedAt: at, appointmentId: 'x', metadata: {}, historyCount: 0, historyPosition: null, status: null, scheduledAt: null,
      cancelledAt: null, cancelledByType: null, rescheduledFromAppointmentId: null, refundDeadlineHours: null,
    })).toEqual({ auditId: 'a', position: 'p', auditCreatedAt: at, appointmentId: 'x', metadata: {}, canceledHistory: { count: 0, position: null }, appointment: null });
  });

  it('D-5: subconsultas del historial `canceled` (conteo y posición exacta con el mismo formato que la auditoría), sin JOIN que multiplique filas', () => {
    const { sql } = canceledAuditQuery(null, 10).toSQL();
    const FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
    expect(sql).toContain(`(select count(*)::int from "appointment_status_history" where "appointment_status_history"."appointment_id" = "audit_log"."entity_id" and "appointment_status_history"."status" = 'canceled')`);
    expect(sql).toContain(`(select to_char(min("appointment_status_history"."created_at") at time zone 'UTC', ${FORMAT}) from "appointment_status_history" where "appointment_status_history"."appointment_id" = "audit_log"."entity_id" and "appointment_status_history"."status" = 'canceled')`);
    expect(sql).toContain(`to_char("audit_log"."created_at" at time zone 'UTC', ${FORMAT})`);
    expect(sql).not.toMatch(/join "appointment_status_history"/);
  });

  it('el conteo llega como número aunque el driver lo devuelva como texto', () => {
    const at = new Date('2026-11-20T12:00:00Z');
    const r = toCanceledAuditRow({
      auditId: 'a', position: 'p', auditCreatedAt: at, appointmentId: 'x', metadata: {}, historyCount: '1' as unknown as number, historyPosition: 'p', status: null,
      scheduledAt: null, cancelledAt: null, cancelledByType: null, rescheduledFromAppointmentId: null, refundDeadlineHours: null,
    });
    expect(r.canceledHistory).toEqual({ count: 1, position: 'p' });
  });
});
