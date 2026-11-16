import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PAYMENT_PROVIDER } from '../src/modules/payments/application/ports/payment-provider.port';
import {
  IDEMPOTENCY_KEY_REPOSITORY,
  PAYMENT_REPOSITORY,
  PEI_FEE_CONFIGURATION_REPOSITORY,
  PROCESSOR_FEE_SCHEDULE_REPOSITORY,
} from '../src/modules/payments/application/ports/payments.repositories';
import { PaymentsUseCases } from '../src/modules/payments/application/use-cases/payments.use-cases';
import {
  DrizzleIdempotencyKeyRepository,
  DrizzlePaymentRepository,
  DrizzlePeiFeeConfigurationRepository,
  DrizzleProcessorFeeScheduleRepository,
} from '../src/modules/payments/infrastructure/persistence/drizzle-payments.repositories';
import { UnconfiguredPaymentProvider } from '../src/modules/payments/infrastructure/unconfigured-payment-provider';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { TRIPWIRE_MARK } from './support/db-tripwire';

// AppModule completo con PaymentsModule registrado: Nest resuelve sus dependencias, el backend arranca SIN variables
// de Stripe (UnconfiguredPaymentProvider) y el registro no abre ninguna conexión. Se compila el contenedor, sin
// escuchar HTTP. El interceptor db-tripwire (setupFiles) cuenta cualquier intento de connect() o query() del driver de
// Neon: el contador no debe cambiar. Ninguna petición sale a Stripe (fetch espiado). La configuración de Stripe se lee
// al compilar el módulo (no al importarlo), así que basta con retirar sus variables antes.
const MP_KEYS = ['STRIPE_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_ALLOW_LIVE', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_TOLERANCE_SECONDS'] as const;
const attempts = () => (globalThis as Record<symbol, number>)[TRIPWIRE_MARK] ?? 0;

describe('AppModule con PaymentsModule', () => {
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of MP_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterAll(() => {
    for (const k of MP_KEYS) if (saved[k] !== undefined) process.env[k] = saved[k];
    jest.restoreAllMocks();
  });

  it('PaymentsModule está registrado en AppModule', () => {
    expect(Reflect.getMetadata('imports', AppModule) as unknown[]).toContain(PaymentsModule);
  });

  it('compila, inyecta casos de uso y repositorios, usa UnconfiguredPaymentProvider y no conecta a nada', async () => {
    const logs: string[] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const before = attempts();

    const app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    try {
      const payments = app.select(PaymentsModule);
      expect(payments.get(PaymentsUseCases)).toBeInstanceOf(PaymentsUseCases);
      expect(app.get(PaymentsUseCases)).toBe(payments.get(PaymentsUseCases));
      expect(payments.get(PAYMENT_PROVIDER)).toBeInstanceOf(UnconfiguredPaymentProvider);
      expect(payments.get(PAYMENT_REPOSITORY)).toBeInstanceOf(DrizzlePaymentRepository);
      expect(payments.get(IDEMPOTENCY_KEY_REPOSITORY)).toBeInstanceOf(DrizzleIdempotencyKeyRepository);
      expect(payments.get(PEI_FEE_CONFIGURATION_REPOSITORY)).toBeInstanceOf(DrizzlePeiFeeConfigurationRepository);
      expect(payments.get(PROCESSOR_FEE_SCHEDULE_REPOSITORY)).toBeInstanceOf(DrizzleProcessorFeeScheduleRepository);
      expect(logs.some((l) => /Stripe no configurado/.test(l))).toBe(true);
      expect(payments.get<{ name: string }>(PAYMENT_PROVIDER).name).toBe('stripe');
    } finally {
      await app.close();
    }

    expect(attempts()).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
