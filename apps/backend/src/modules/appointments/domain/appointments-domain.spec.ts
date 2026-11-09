import { canTransition, assertTransition, isTerminal } from './appointment-status';
import { holdExpiresAt, isHoldActive, occupiesSchedule, HOLD_MINUTES } from './hold';
import { blockOf, excludeBusy, occupancyOf, overlaps } from './occupancy';
import { patientCancellationOutcome, hoursUntil, DOCTOR_CANCELLATION_OUTCOME } from './cancellation-rules';
import { normalizePrice, isEffective, INITIAL_CONSULTATION_PRICE, CONSULTATION_CURRENCY } from './consultation-price';
import { validatePolicy, sameParameters, INITIAL_POLICY } from './cancellation-policy';
import { addLocalDays, localDateString } from './local-date';
import { InvalidAppointmentStateError, InvalidCancellationPolicyError, InvalidConsultationPriceError } from './appointments.errors';

const T = (iso: string) => new Date(iso);

describe('M08 dominio de citas', () => {
  describe('estados (refleja gst_appointment_guard)', () => {
    it('[TC-M08-001][RN-011][RN-012] pending_payment solo pasa a confirmed o expired', () => {
      expect(canTransition('pending_payment', 'confirmed')).toBe(true);
      expect(canTransition('pending_payment', 'expired')).toBe(true);
      expect(canTransition('pending_payment', 'canceled')).toBe(false);
      expect(() => assertTransition('pending_payment', 'canceled')).toThrow(InvalidAppointmentStateError);
    });

    it('[TC-M08-002][RN-012][CC-4] expired es terminal: nunca se reactiva', () => {
      expect(isTerminal('expired')).toBe(true);
      expect(canTransition('expired', 'confirmed')).toBe(false);
    });

    it('[TC-M08-003][DA-4] desde confirmed solo cancelación o resultado final; ninguna vuelta atrás', () => {
      expect(canTransition('confirmed', 'canceled')).toBe(true);
      expect(canTransition('confirmed', 'completed')).toBe(true);
      expect(canTransition('confirmed', 'no_show_doctor')).toBe(true);
      expect(canTransition('confirmed', 'pending_payment')).toBe(false);
      expect(canTransition('confirmed', 'expired')).toBe(false);
      expect(canTransition('canceled', 'confirmed')).toBe(false);
    });
  });

  describe('retención (RN-009)', () => {
    const now = T('2026-11-10T15:00:00Z');
    it('[TC-M08-004][RN-009] la retención dura exactamente 5 minutos', () => {
      expect(HOLD_MINUTES).toBe(5);
      expect(holdExpiresAt(now).toISOString()).toBe('2026-11-10T15:05:00.000Z');
    });

    it('[TC-M08-005][DA-9] límite exacto: vigente 1 ms antes; vencida en el instante del vencimiento', () => {
      const a = { status: 'pending_payment' as const, paymentHoldExpiresAt: T('2026-11-10T15:05:00Z') };
      expect(isHoldActive(a, T('2026-11-10T15:04:59.999Z'))).toBe(true);
      expect(isHoldActive(a, T('2026-11-10T15:05:00Z'))).toBe(false);
      expect(occupiesSchedule(a, T('2026-11-10T15:05:00Z'))).toBe(false);
    });

    it('[TC-M08-006][DA-9] una cita confirmada ocupa horario sin importar la retención', () => {
      expect(occupiesSchedule({ status: 'confirmed', paymentHoldExpiresAt: null }, now)).toBe(true);
      expect(occupiesSchedule({ status: 'canceled', paymentHoldExpiresAt: null }, now)).toBe(false);
    });
  });

  describe('ocupación (DA-3, DA-5)', () => {
    it('[TC-M08-007][DA-3] el bloque usa la duración; intervalos semiabiertos: contiguos no se cruzan', () => {
      const a = occupancyOf(T('2026-11-10T15:00:00Z'), 30);
      expect(a.endsAt.toISOString()).toBe('2026-11-10T15:30:00.000Z');
      expect(overlaps(a, occupancyOf(T('2026-11-10T15:30:00Z'), 30))).toBe(false);
      expect(overlaps(a, occupancyOf(T('2026-11-10T15:29:00Z'), 30))).toBe(true);
    });

    it('[TC-M08-008][DA-5] excludeBusy quita solo los horarios que se cruzan', () => {
      const slots = ['15:00', '15:30', '16:00'].map((h) => ({ startsAt: `2026-11-10T${h}:00.000Z`, endsAt: '' }))
        .map((s) => ({ ...s, endsAt: new Date(new Date(s.startsAt).getTime() + 1_800_000).toISOString() }));
      const left = excludeBusy(slots, [occupancyOf(T('2026-11-10T15:30:00Z'), 30)]);
      expect(left.map((s) => s.startsAt)).toEqual(['2026-11-10T15:00:00.000Z', '2026-11-10T16:00:00.000Z']);
    });
  });

  describe('cancelación (RN-013, RN-019, RN-020)', () => {
    const at = T('2026-11-12T15:00:00Z');
    it('[TC-M08-009][RN-019] con 24 h exactas o más: reembolso total', () => {
      expect(patientCancellationOutcome(at, T('2026-11-11T15:00:00Z'), 24)).toBe('full_refund');
    });
    it('[TC-M08-010][RN-020] 1 ms menos de 24 h: sin reembolso; también después del inicio', () => {
      expect(patientCancellationOutcome(at, T('2026-11-11T15:00:00.001Z'), 24)).toBe('no_refund');
      expect(patientCancellationOutcome(at, T('2026-11-12T15:10:00Z'), 24)).toBe('no_refund');
      expect(hoursUntil(at, T('2026-11-12T03:00:00Z'))).toBe(12);
    });
    it('[TC-M08-011][RN-013] la cancelación del médico siempre es reembolso total', () => {
      expect(DOCTOR_CANCELLATION_OUTCOME).toBe('full_refund');
    });
  });

  describe('precio global (RN-007, AP-1)', () => {
    it('[TC-M08-012][AP-1] precio inicial 200.00 MXN', () => {
      expect(INITIAL_CONSULTATION_PRICE).toBe('200.00');
      expect(CONSULTATION_CURRENCY).toBe('MXN');
    });
    it('[TC-M08-013][P-4] normaliza a 2 decimales y rechaza cero, negativos, 3 decimales y desbordamiento', () => {
      expect(normalizePrice('250')).toBe('250.00');
      expect(normalizePrice('199.9')).toBe('199.90');
      for (const bad of ['0', '0.00', '-1', '10.123', '123456789', 'abc', '', 200 as unknown as string]) {
        expect(() => normalizePrice(bad)).toThrow(InvalidConsultationPriceError);
      }
    });
    it('[TC-M08-014][P-1] vigencia: desde incluido, hasta excluido', () => {
      const v = { effectiveFrom: T('2026-11-01T00:00:00Z'), effectiveUntil: T('2026-11-05T00:00:00Z') };
      expect(isEffective(v, T('2026-11-01T00:00:00Z'))).toBe(true);
      expect(isEffective(v, T('2026-11-05T00:00:00Z'))).toBe(false);
      expect(isEffective({ ...v, effectiveUntil: null }, T('2030-01-01T00:00:00Z'))).toBe(true);
    });
  });

  describe('política de citas (RF-16, AP-22)', () => {
    it('[TC-M08-015][AP-22] los valores iniciales son 24 h, 2 reagendamientos, W 30, Tol 15, L 60 y G 5 min', () => {
      expect(INITIAL_POLICY).toEqual({
        refundDeadlineHours: 24, maxReschedules: 2, doctorWaitMinutes: 30, patientToleranceMinutes: 15, maxProtectedWaitMinutes: 60, reconnectGraceMinutes: 5,
      });
      expect(validatePolicy({ ...INITIAL_POLICY })).toEqual(INITIAL_POLICY);
    });
    it('[TC-M08-017][AP-22] L y G: por omisión 60 y 5; se rechazan W > L, G >= Tol, G = 0 y no enteros', () => {
      const { maxProtectedWaitMinutes: _l, reconnectGraceMinutes: _g, ...base } = INITIAL_POLICY;
      expect(validatePolicy(base)).toEqual(INITIAL_POLICY);
      expect(validatePolicy({ ...INITIAL_POLICY, maxProtectedWaitMinutes: 30, reconnectGraceMinutes: 14 })).toMatchObject({ maxProtectedWaitMinutes: 30, reconnectGraceMinutes: 14 });
      for (const bad of [
        { maxProtectedWaitMinutes: 29 }, { reconnectGraceMinutes: 15 }, { reconnectGraceMinutes: 0 }, { maxProtectedWaitMinutes: 60.5 }, { reconnectGraceMinutes: '5' },
      ]) {
        expect(() => validatePolicy({ ...INITIAL_POLICY, ...bad })).toThrow(InvalidCancellationPolicyError);
      }
    });
    it('[TC-M08-018][DA-3][M-1c] blockOf usa siempre el fin guardado, sin fallback O1', () => {
      const at = new Date('2026-11-12T16:00:00Z');
      expect(blockOf({ scheduledAt: at, agendaBlockEndsAt: new Date('2026-11-12T16:45:00Z') })).toEqual({ startsAt: at, endsAt: new Date('2026-11-12T16:45:00Z') });
      expect(blockOf.length).toBe(1);
    });
    it('[TC-M08-016][A.11.1] rechaza no enteros, fuera de rango y tolerancia mayor que la ventana del médico', () => {
      expect(() => validatePolicy({ ...INITIAL_POLICY, refundDeadlineHours: 1.5 })).toThrow(InvalidCancellationPolicyError);
      expect(() => validatePolicy({ ...INITIAL_POLICY, doctorWaitMinutes: 0 })).toThrow(InvalidCancellationPolicyError);
      expect(() => validatePolicy({ ...INITIAL_POLICY, patientToleranceMinutes: 31 })).toThrow(InvalidCancellationPolicyError);
      expect(() => validatePolicy({ ...INITIAL_POLICY, maxReschedules: '2' })).toThrow(InvalidCancellationPolicyError);
    });
    it('[TC-M08-017] sameParameters compara los cuatro parámetros', () => {
      expect(sameParameters(INITIAL_POLICY, { ...INITIAL_POLICY })).toBe(true);
      expect(sameParameters(INITIAL_POLICY, { ...INITIAL_POLICY, maxReschedules: 3 })).toBe(false);
    });
  });

  it('[TC-M08-018][D-1] fechas locales del centro de México', () => {
    expect(localDateString(T('2026-11-10T05:59:00Z'))).toBe('2026-11-09');
    expect(localDateString(T('2026-11-10T06:00:00Z'))).toBe('2026-11-10');
    expect(addLocalDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});
