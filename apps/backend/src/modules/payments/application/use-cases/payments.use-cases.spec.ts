import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import { money, type Money } from '../../domain/money';
import type { ProcessorFeeSnapshot } from '../../domain/payment-amounts';
import type { PaymentRequest } from '../../domain/payment-request';
import type { PaymentStatus } from '../../domain/payment-status';
import {
  InvalidPaymentRequestError,
  NegativeDoctorNetError,
} from '../../domain/payments.errors';
import {
  PaymentProviderError,
  type PaymentProviderPort,
  type ProviderPaymentSnapshot,
} from '../ports/payment-provider.port';
import type {
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
  NewPaymentRecord,
  PaymentProviderUpdate,
  PaymentRecord,
  PaymentRepository,
  PeiFeeVersion,
} from '../ports/payments.repositories';
import {
  ActivePaymentExistsError,
  IdempotencyKeyConflictError,
  NoEffectivePeiFeeError,
  NoEffectiveProcessorFeeError,
  PaymentInProgressError,
  PaymentNotFoundError,
  PaymentTypeNotEnabledError,
  ProviderStateConflictError,
} from '../payments-use-case.errors';
import {
  IN_FLIGHT_WINDOW_MS,
  PaymentsUseCases,
  type CreateConsultationPaymentInput,
} from './payments.use-cases';

// Casos de uso de pagos con dobles en memoria: sin base de datos ni Mercado Pago. Los dobles reproducen las
// restricciones de 0017 que importan aquí (idempotency_key_uq, payment_active_appointment_uq, valores fijados una
// vez) y el rollback de la unidad de trabajo. Comisiones y tarifas ilustrativas, no comerciales.

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SCHEDULE: ProcessorFeeSnapshot = {
  scheduleId: 'sch-1',
  percentageRate: '0.031900',
  fixedFee: money(400),
  vatRate: '0.160000',
};
const FEE: PeiFeeVersion = { id: 'fee-1', fixedFee: money(20_000) };
const CARD = {
  token: 'tok_brick_secreto',
  paymentMethodId: 'visa',
  installments: 1,
  payerEmail: 'paciente@example.com',
};
const input = (
  over: Partial<CreateConsultationPaymentInput> = {},
): CreateConsultationPaymentInput => ({
  idempotencyKey: 'clave-idempotencia-0001',
  patientId: 'pat-1',
  doctorId: 'doc-1',
  appointmentId: 'apt-1',
  gross: money(100_000),
  card: CARD,
  ...over,
});

class World {
  now = new Date('2026-11-11T12:00:00Z');
  payments = new Map<string, PaymentRecord>();
  keys = new Map<string, IdempotencyKeyRecord>();
  fee: PeiFeeVersion | null = FEE;
  schedule: ProcessorFeeSnapshot | null = SCHEDULE;
  providerCalls: PaymentRequest[] = [];
  providerQueries: string[] = [];
  createBehaviour: ((r: PaymentRequest) => Promise<ProviderPaymentSnapshot>)[] =
    [];
  getBehaviour: ((id: string) => Promise<ProviderPaymentSnapshot>)[] = [];
  seq = 0;
  txChain: Promise<void> = Promise.resolve();

  snapshot(
    r: PaymentRequest,
    status: PaymentStatus = 'succeeded',
    over: Partial<ProviderPaymentSnapshot> = {},
  ): ProviderPaymentSnapshot {
    return {
      provider: 'mercado_pago',
      providerPaymentId: '987654321',
      providerStatus: status === 'succeeded' ? 'approved/accredited' : status,
      status,
      externalReference: r.paymentId,
      amount: r.split.gross,
      refunded: money(0),
      providerFeeActual: money(4064),
      netReceived: money(95_936),
      moneyReleaseDate: new Date('2026-11-25T16:00:00Z'),
      ...over,
    };
  }

  useCases(): PaymentsUseCases {
    return buildUseCases(this);
  }

  advance(ms: number) {
    this.now = new Date(this.now.getTime() + ms);
  }
}

function buildUseCases(w: World): PaymentsUseCases {
  const payments: PaymentRepository = {
    async insert(r: NewPaymentRecord) {
      if (
        [...w.payments.values()].some(
          (p) =>
            p.appointmentId === r.appointmentId &&
            !['failed', 'canceled'].includes(p.status),
        )
      ) {
        throw new UniqueConstraintViolationError({
          code: '23505',
          constraint: 'payment_active_appointment_uq',
          table: 'payment',
        });
      }
      w.payments.set(r.id, {
        ...r,
        providerPaymentId: null,
        providerStatus: null,
        providerFeeActual: null,
        netReceived: null,
        moneyReleaseDate: null,
        feeReconciledAt: null,
        updatedAt: r.createdAt,
      });
    },
    async findById(id) {
      const p = w.payments.get(id);
      return p ? { ...p } : null;
    },
    async update(id: string, c: PaymentProviderUpdate) {
      const p = w.payments.get(id)!;
      // Emula payment_guard: los valores fijados una vez no cambian.
      for (const f of [
        'providerPaymentId',
        'providerFeeActual',
        'netReceived',
        'moneyReleaseDate',
      ] as const) {
        if (
          c[f] !== undefined &&
          p[f] !== null &&
          JSON.stringify(p[f]) !== JSON.stringify(c[f])
        )
          throw new Error(`payment_guard: ${f}`);
      }
      const next = {
        ...p,
        ...Object.fromEntries(
          Object.entries(c).filter(([, v]) => v !== undefined),
        ),
      } as PaymentRecord;
      w.payments.set(id, next);
    },
  };
  const keys: IdempotencyKeyRepository = {
    async find(scope, key) {
      const k = w.keys.get(`${scope}|${key}`);
      return k ? { ...k } : null;
    },
    async insert(r) {
      if (w.keys.has(`${r.scope}|${r.key}`))
        throw new UniqueConstraintViolationError({
          code: '23505',
          constraint: 'idempotency_key_uq',
          table: 'idempotency_key',
        });
      w.keys.set(`${r.scope}|${r.key}`, { ...r, completedAt: null });
    },
    async complete(scope, key, at) {
      const k = w.keys.get(`${scope}|${key}`)!;
      if (k.completedAt === null) k.completedAt = at;
    },
  };
  const provider: PaymentProviderPort = {
    name: 'mercado_pago',
    async createPayment(r) {
      w.providerCalls.push(r);
      const next = w.createBehaviour.shift();
      return next ? next(r) : w.snapshot(r);
    },
    async getPayment(id) {
      w.providerQueries.push(id);
      const next = w.getBehaviour.shift();
      if (!next) throw new Error('sin respuesta preparada');
      return next(id);
    },
  };
  return new PaymentsUseCases({
    // Unidad de trabajo con rollback: si el trabajo falla, se restaura el estado anterior. Las transacciones se
    // serializan, como PostgreSQL ante una fila única en conflicto aún sin confirmar (la segunda espera al COMMIT).
    uow: {
      async runInTransaction(work) {
        const previous = w.txChain;
        let done!: () => void;
        w.txChain = new Promise<void>((r) => (done = r));
        await previous;
        const before = {
          payments: new Map([...w.payments].map(([k, v]) => [k, { ...v }])),
          keys: new Map([...w.keys].map(([k, v]) => [k, { ...v }])),
        };
        try {
          return await work();
        } catch (e) {
          w.payments = before.payments;
          w.keys = before.keys;
          throw e;
        } finally {
          done();
        }
      },
    },
    clock: { now: () => w.now },
    payments,
    keys,
    peiFees: { findEffective: async () => w.fee },
    processorFees: {
      findEffective: async () => w.schedule,
      findById: async (id) =>
        w.schedule?.scheduleId === id ? w.schedule : null,
    },
    provider,
    ids: { newId: () => uuid(++w.seq) },
  });
}

const cents = (m: Money | null) => (m ? m.cents : null);

describe('Pagos · creación', () => {
  it('guarda el snapshot, llama al proveedor con X-Idempotency-Key = payment.id y persiste su respuesta', async () => {
    const w = new World();
    const r = await w.useCases().createConsultationPayment(input());
    expect(w.providerCalls).toHaveLength(1);
    expect(w.providerCalls[0].idempotencyKey).toBe(r.payment.paymentId);
    const p = w.payments.get(r.payment.paymentId)!;
    expect({
      gross: cents(p.gross),
      pei: cents(p.peiFixedFee),
      net: cents(p.doctorNet),
      est: cents(p.providerFeeEstimated),
      real: cents(p.providerFeeActual),
    }).toEqual({
      gross: 100_000,
      pei: 20_000,
      net: 80_000,
      est: 4164,
      real: 4064,
    });
    expect(p).toMatchObject({
      peiFeeConfigurationId: 'fee-1',
      processorFeeScheduleId: 'sch-1',
      providerPaymentId: '987654321',
      providerStatus: 'approved/accredited',
      status: 'succeeded',
    });
    expect(r).toMatchObject({
      recoverable: false,
      payment: {
        status: 'succeeded',
        captured: true,
        doctorNet: '800.00',
        providerFeeActual: '40.64',
        providerFeeEstimated: '41.64',
      },
    });
    expect(
      w.keys.get('payment.create|clave-idempotencia-0001')!.completedAt,
    ).toEqual(w.now);
  });

  it('PAY-07: la comisión real del procesador no reduce el neto del médico', async () => {
    const w = new World();
    w.createBehaviour.push(async (req) =>
      w.snapshot(req, 'succeeded', { providerFeeActual: money(9_999) }),
    );
    const r = await w.useCases().createConsultationPayment(input());
    expect(r.payment.doctorNet).toBe('800.00');
    expect(r.payment.providerFeeActual).toBe('99.99');
    expect(r.payment.providerFeeEstimated).toBe('41.64');
  });

  it('authorized (processing) no se considera capturado', async () => {
    const w = new World();
    w.createBehaviour.push(async (req) =>
      w.snapshot(req, 'processing', {
        providerStatus: 'authorized/pending_capture',
        providerFeeActual: null,
        netReceived: null,
        moneyReleaseDate: null,
      }),
    );
    const r = await w.useCases().createConsultationPayment(input());
    expect(r.payment).toMatchObject({
      status: 'processing',
      captured: false,
      providerStatus: 'authorized/pending_capture',
      providerFeeActual: null,
    });
  });

  it('no guarda datos de la tarjeta', async () => {
    const w = new World();
    await w.useCases().createConsultationPayment(input());
    expect(
      JSON.stringify([...w.payments.values(), ...w.keys.values()]),
    ).not.toMatch(/tok_brick_secreto|paciente@example\.com|visa/);
  });

  it.each([
    [
      'sin comisión fija vigente',
      (w: World) => (w.fee = null),
      NoEffectivePeiFeeError,
    ],
    [
      'sin tarifa vigente del procesador',
      (w: World) => (w.schedule = null),
      NoEffectiveProcessorFeeError,
    ],
  ])('%s: no crea el pago ni llama al proveedor', async (_n, setup, error) => {
    const w = new World();
    setup(w);
    await expect(
      w.useCases().createConsultationPayment(input()),
    ).rejects.toThrow(error);
    expect(w.payments.size).toBe(0);
    expect(w.keys.size).toBe(0);
    expect(w.providerCalls).toEqual([]);
  });

  it('PAY-10: precio menor que la comisión fija, sin pago ni llamada', async () => {
    const w = new World();
    await expect(
      w.useCases().createConsultationPayment(input({ gross: money(100) })),
    ).rejects.toThrow(NegativeDoctorNetError);
    expect(w.payments.size + w.providerCalls.length).toBe(0);
  });

  it.each([
    ['clave inválida', { idempotencyKey: 'corta' }],
    ['sin cita', { appointmentId: '' }],
    ['sin médico', { doctorId: '' }],
  ])('rechaza %s', async (_n, over) => {
    await expect(
      new World().useCases().createConsultationPayment(input(over)),
    ).rejects.toThrow(InvalidPaymentRequestError);
  });

  it('medicamentos y PrEP no están habilitados en esta entrega', async () => {
    await expect(
      new World()
        .useCases()
        .createConsultationPayment({ ...input(), type: 'medication' }),
    ).rejects.toThrow(PaymentTypeNotEnabledError);
  });
});

describe('Pagos · idempotencia y cobros duplicados', () => {
  it('la misma clave y la misma solicitud devuelven el mismo pago sin volver a cobrar', async () => {
    const w = new World();
    const uc = w.useCases();
    const a = await uc.createConsultationPayment(input());
    const b = await uc.createConsultationPayment(
      input({ card: { ...CARD, token: 'tok_otro' } }),
    );
    expect(b.payment.paymentId).toBe(a.payment.paymentId);
    expect(w.providerCalls).toHaveLength(1);
    expect(w.payments.size).toBe(1);
  });

  it('la misma clave con otra solicitud es un conflicto', async () => {
    const w = new World();
    const uc = w.useCases();
    await uc.createConsultationPayment(input());
    await expect(
      uc.createConsultationPayment(input({ gross: money(90_000) })),
    ).rejects.toThrow(IdempotencyKeyConflictError);
    expect(w.providerCalls).toHaveLength(1);
  });

  it('AP-27a: otra clave para la misma cita con un pago activo es un conflicto, sin residuos', async () => {
    const w = new World();
    const uc = w.useCases();
    await uc.createConsultationPayment(input());
    await expect(
      uc.createConsultationPayment(
        input({ idempotencyKey: 'clave-idempotencia-0002' }),
      ),
    ).rejects.toThrow(ActivePaymentExistsError);
    expect(w.payments.size).toBe(1);
    expect(w.keys.size).toBe(1);
    expect(w.providerCalls).toHaveLength(1);
  });

  it('solicitudes concurrentes con la misma clave: un solo pago y una sola llamada al proveedor', async () => {
    const w = new World();
    const uc = w.useCases();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    w.createBehaviour.push(async (req) => {
      await gate;
      return w.snapshot(req);
    });
    const first = uc.createConsultationPayment(input());
    const second = uc.createConsultationPayment(input());
    await expect(second).rejects.toThrow(PaymentInProgressError);
    release();
    await first;
    expect(w.payments.size).toBe(1);
    expect(w.providerCalls).toHaveLength(1);
  });

  it('un intento rechazado deja el pago fallido; la misma clave no vuelve a cobrar y otra clave puede reintentar', async () => {
    const w = new World();
    const uc = w.useCases();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError(
        'rejected_request',
        'rechazado',
        400,
        '2034',
      );
    });
    const a = await uc.createConsultationPayment(input());
    expect(a).toMatchObject({
      recoverable: false,
      providerError: 'rejected_request',
      payment: { status: 'failed' },
    });
    const again = await uc.createConsultationPayment(input());
    expect(again.payment).toMatchObject({
      paymentId: a.payment.paymentId,
      status: 'failed',
    });
    expect(w.providerCalls).toHaveLength(1);
    const b = await uc.createConsultationPayment(
      input({ idempotencyKey: 'clave-idempotencia-0002' }),
    );
    expect(b.payment.status).toBe('succeeded');
    expect(w.payments.size).toBe(2);
  });
});

describe('Pagos · errores del proveedor y recuperación', () => {
  it.each(['timeout', 'unavailable', 'unexpected_response'] as const)(
    '%s: el pago queda pendiente y recuperable; el reintento con la misma clave reenvía EL MISMO pago',
    async (kind) => {
      const w = new World();
      const uc = w.useCases();
      w.createBehaviour.push(async () => {
        throw new PaymentProviderError(kind, 'sin respuesta fiable');
      });
      const a = await uc.createConsultationPayment(input());
      expect(a).toMatchObject({
        recoverable: true,
        providerError: kind,
        payment: { status: 'pending', providerPaymentId: null },
      });
      expect(
        w.keys.get('payment.create|clave-idempotencia-0001')!.completedAt,
      ).toBeNull();
      // Dentro de la ventana: otra solicitud podría estar en curso; no se reenvía.
      await expect(uc.createConsultationPayment(input())).rejects.toThrow(
        PaymentInProgressError,
      );
      w.advance(IN_FLIGHT_WINDOW_MS + 1);
      const b = await uc.createConsultationPayment(
        input({ card: { ...CARD, token: 'tok_reintento' } }),
      );
      expect(b).toMatchObject({
        recoverable: false,
        payment: { paymentId: a.payment.paymentId, status: 'succeeded' },
      });
      expect(w.providerCalls.map((c) => c.idempotencyKey)).toEqual([
        a.payment.paymentId,
        a.payment.paymentId,
      ]);
      expect(w.payments.size).toBe(1);
    },
  );

  it('el reenvío usa el snapshot registrado y se detiene si la tarifa ya no coincide', async () => {
    const w = new World();
    const uc = w.useCases();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError('timeout', 'x');
    });
    await uc.createConsultationPayment(input());
    w.advance(IN_FLIGHT_WINDOW_MS + 1);
    w.schedule = { ...SCHEDULE, percentageRate: '0.050000' };
    await expect(uc.createConsultationPayment(input())).rejects.toThrow(
      ProviderStateConflictError,
    );
    expect(w.providerCalls).toHaveLength(1);
  });

  it('un error que no es del proveedor se propaga sin marcar el pago', async () => {
    const w = new World();
    w.createBehaviour.push(async () => {
      throw new Error('fallo interno');
    });
    await expect(
      w.useCases().createConsultationPayment(input()),
    ).rejects.toThrow('fallo interno');
    expect([...w.payments.values()][0].status).toBe('pending');
  });

  it('una respuesta que contradice el pago (otra referencia) no se persiste', async () => {
    const w = new World();
    w.createBehaviour.push(async (req) =>
      w.snapshot(req, 'succeeded', { externalReference: 'otra' }),
    );
    await expect(
      w.useCases().createConsultationPayment(input()),
    ).rejects.toThrow(ProviderStateConflictError);
    const p = [...w.payments.values()][0];
    expect(p).toMatchObject({ status: 'pending', providerPaymentId: null });
  });
});

describe('Pagos · consulta', () => {
  it('sin refresh devuelve lo registrado sin llamar al proveedor; inexistente → not found', async () => {
    const w = new World();
    const uc = w.useCases();
    const { payment } = await uc.createConsultationPayment(input());
    expect(await uc.getPayment(payment.paymentId)).toEqual(payment);
    expect(w.providerQueries).toEqual([]);
    await expect(uc.getPayment(uuid(99))).rejects.toThrow(PaymentNotFoundError);
  });

  it('con refresh consulta el estado real y aplica una transición permitida y los datos aún no fijados', async () => {
    const w = new World();
    const uc = w.useCases();
    w.createBehaviour.push(async (req) =>
      w.snapshot(req, 'processing', {
        providerStatus: 'in_process/pending_review_manual',
        providerFeeActual: null,
        netReceived: null,
        moneyReleaseDate: null,
      }),
    );
    const { payment } = await uc.createConsultationPayment(input());
    const req = w.providerCalls[0];
    w.getBehaviour.push(async () => w.snapshot(req, 'succeeded'));
    const view = await uc.getPayment(payment.paymentId, { refresh: true });
    expect(w.providerQueries).toEqual(['987654321']);
    expect(view).toMatchObject({
      status: 'succeeded',
      captured: true,
      providerFeeActual: '40.64',
      netReceived: '959.36',
      providerStatus: 'approved/accredited',
    });
  });

  it('con refresh rechaza transiciones no permitidas y valores ya fijados distintos', async () => {
    const w = new World();
    const uc = w.useCases();
    const { payment } = await uc.createConsultationPayment(input());
    const req = w.providerCalls[0];
    w.getBehaviour.push(async () => w.snapshot(req, 'pending'));
    await expect(
      uc.getPayment(payment.paymentId, { refresh: true }),
    ).rejects.toThrow(/transición succeeded → pending/);
    w.getBehaviour.push(async () =>
      w.snapshot(req, 'succeeded', { providerFeeActual: money(5_000) }),
    );
    await expect(
      uc.getPayment(payment.paymentId, { refresh: true }),
    ).rejects.toThrow(/valor distinto del ya registrado \(la comisión real\)/);
    w.getBehaviour.push(async () =>
      w.snapshot(req, 'succeeded', { amount: money(1) }),
    );
    await expect(
      uc.getPayment(payment.paymentId, { refresh: true }),
    ).rejects.toThrow(/importe distinto/);
    expect(w.payments.get(payment.paymentId)!.status).toBe('succeeded');
  });

  it('con refresh propaga el error del proveedor sin modificar el pago', async () => {
    const w = new World();
    const uc = w.useCases();
    const { payment } = await uc.createConsultationPayment(input());
    w.getBehaviour.push(async () => {
      throw new PaymentProviderError('unavailable', 'x', 503);
    });
    await expect(
      uc.getPayment(payment.paymentId, { refresh: true }),
    ).rejects.toBeInstanceOf(PaymentProviderError);
    expect(w.payments.get(payment.paymentId)!.status).toBe('succeeded');
  });

  it('con refresh y sin referencia del proveedor devuelve lo registrado', async () => {
    const w = new World();
    const uc = w.useCases();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError('timeout', 'x');
    });
    const { payment } = await uc.createConsultationPayment(input());
    expect(
      (await uc.getPayment(payment.paymentId, { refresh: true })).status,
    ).toBe('pending');
    expect(w.providerQueries).toEqual([]);
  });
});
