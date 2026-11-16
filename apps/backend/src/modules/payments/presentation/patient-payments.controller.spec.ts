import { BadRequestException, ForbiddenException, ServiceUnavailableException, type ArgumentMetadata } from '@nestjs/common';
import { createValidationPipe } from '../../../common/validation/create-validation-pipe';
import type { Actor } from '../../../common/application/actor';
import { PaymentProviderError } from '../application/ports/payment-provider.port';
import type { PayAppointmentResult, PayAppointmentUseCase } from '../application/use-cases/pay-appointment.use-case';
import type { PaymentView } from '../application/use-cases/payments.use-cases';
import type { SyncAppointmentPaymentUseCase } from '../application/use-cases/sync-appointment-payment.use-case';
import { PayAppointmentDto } from './dto/pay-appointment.dto';
import { PatientPaymentsController, toPatientPaymentResponse } from './patient-payments.controller';

// F4: rutas del paciente con dobles (sin Nest HTTP, sin base de datos ni Mercado Pago).
const ACTOR: Actor = { userId: 'u-1', userProfileId: 'up-1', role: 'patient', ipAddress: null, userAgent: null };
const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
// Objeto plano (el cuerpo JSON tal como llega); la validación lo convierte en PayAppointmentDto.
const BODY = { token: 'tok_brick_abcdef', paymentMethodId: 'visa', issuerId: '310', installments: 1, payerEmail: 'paciente@example.com' };
const view = (status: PaymentView['status']): PaymentView => ({
  paymentId: PAYMENT_ID, type: 'consultation', status, captured: status === 'succeeded', providerPaymentId: '987', providerStatus: 'approved/accredited',
  gross: '650.00', peiFixedFee: '100.00', doctorNet: '550.00', providerFeeEstimated: '28.69', providerFeeActual: '27.00', netReceived: '623.00', moneyReleaseDate: null,
});
const RESULT: PayAppointmentResult = { payment: view('succeeded'), confirmation: { result: 'confirmed' }, appointmentConfirmed: true, recoverable: false };

function controller(opts: { patient?: string | null; pay?: PayAppointmentResult | Error; sync?: unknown } = {}) {
  const payCalls: unknown[] = [];
  const syncCalls: unknown[] = [];
  const c = new PatientPaymentsController(
    { execute: async (i: unknown) => { payCalls.push(i); if (opts.pay instanceof Error) throw opts.pay; return opts.pay ?? RESULT; } } as unknown as PayAppointmentUseCase,
    { execute: async (i: unknown) => { syncCalls.push(i); if (opts.sync instanceof Error) throw opts.sync; return opts.sync ?? RESULT; } } as unknown as SyncAppointmentPaymentUseCase,
    { patientProfileIdFor: async () => (opts.patient === undefined ? 'pat-1' : opts.patient) },
    // Checkout de medicamentos y acción pendiente: sin uso en estas pruebas (ver patient-payments.stripe.spec.ts).
    { execute: async () => { throw new Error('no esperado'); } } as never,
    { execute: async () => { throw new Error('no esperado'); } } as never,
    { pendingAction: async () => null } as never,
  );
  return { c, payCalls, syncCalls };
}

const pipe = createValidationPipe();
const META: ArgumentMetadata = { type: 'body', metatype: PayAppointmentDto };
const validate = (body: unknown) => pipe.transform(body, META);

describe('PatientPaymentsController · pago', () => {
  it('el paciente sale de la sesión, la clave del encabezado y el cuerpo solo trae el token y datos del Brick (sin importe)', async () => {
    const s = controller();
    await s.c.payAppointment(ACTOR, APPOINTMENT_ID, 'clave-idempotencia-0001', BODY as PayAppointmentDto);
    expect(s.payCalls).toEqual([{
      idempotencyKey: 'clave-idempotencia-0001', patientId: 'pat-1', appointmentId: APPOINTMENT_ID,
      card: { token: 'tok_brick_abcdef', paymentMethodId: 'visa', issuerId: '310', installments: 1, payerEmail: 'paciente@example.com' },
    }]);
  });

  it('la respuesta al paciente no expone la comisión de PEI, el neto del médico ni las comisiones del procesador', async () => {
    const r = await controller().c.payAppointment(ACTOR, APPOINTMENT_ID, 'clave-idempotencia-0001', BODY as PayAppointmentDto);
    expect(r).toEqual({ paymentId: PAYMENT_ID, status: 'succeeded', amount: '650.00', currency: 'MXN', appointmentConfirmed: true, confirmation: { result: 'confirmed' }, recoverable: false });
    expect(JSON.stringify(r)).not.toMatch(/550\.00|100\.00|28\.69|27\.00|623\.00|doctorNet|peiFixedFee|providerFee/);
  });

  it('sin perfil de paciente: 403 y no se llama al caso de uso', async () => {
    const s = controller({ patient: null });
    await expect(s.c.payAppointment(ACTOR, APPOINTMENT_ID, 'k', BODY as PayAppointmentDto)).rejects.toThrow(ForbiddenException);
    await expect(s.c.payAppointment({ ...ACTOR, userProfileId: null }, APPOINTMENT_ID, 'k', BODY as PayAppointmentDto)).rejects.toThrow(ForbiddenException);
    expect(s.payCalls).toEqual([]);
  });

  it('sin Idempotency-Key, el caso de uso recibe una clave vacía (que el flujo de creación rechaza como inválida)', async () => {
    const s = controller();
    await s.c.payAppointment(ACTOR, APPOINTMENT_ID, undefined, BODY as PayAppointmentDto);
    expect((s.payCalls[0] as { idempotencyKey: string }).idempotencyKey).toBe('');
  });
});

describe('PayAppointmentDto (validación global)', () => {
  it('acepta los datos del Brick', async () => {
    await expect(validate({ ...BODY })).resolves.toBeInstanceOf(PayAppointmentDto);
  });

  it.each([
    ['importe enviado por el cliente', { ...BODY, transactionAmount: 1 }],
    ['importe con el nombre del Brick', { ...BODY, transaction_amount: 1 }],
    ['número de tarjeta', { ...BODY, cardNumber: '4111111111111111' }],
    ['CVV', { ...BODY, securityCode: '123' }],
    ['token con caracteres extraños', { ...BODY, token: 'tok brick' }],
    ['sin token', { ...BODY, token: undefined }],
    ['mensualidades fuera de rango', { ...BODY, installments: 0 }],
    ['correo inválido', { ...BODY, payerEmail: 'x' }],
  ])('rechaza %s', async (_n, body) => {
    await expect(validate(body)).rejects.toThrow(BadRequestException);
  });
});

describe('PatientPaymentsController · sincronización', () => {
  it('CC-4: sincroniza con el paciente de la sesión', async () => {
    const s = controller();
    await s.c.syncPayment(ACTOR, PAYMENT_ID);
    expect(s.syncCalls).toEqual([{ paymentId: PAYMENT_ID, requestingPatientId: 'pat-1' }]);
  });

  it('un error del proveedor se traduce a 503 genérico, sin detalles', async () => {
    const s = controller({ sync: new PaymentProviderError('unavailable', 'Mercado Pago no disponible (HTTP 503)', 503, 'x') });
    const e = await s.c.syncPayment(ACTOR, PAYMENT_ID).then(() => null, (x: unknown) => x as ServiceUnavailableException);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect(e!.message).not.toMatch(/Mercado Pago|HTTP|503/);
  });
});

describe('toPatientPaymentResponse · recuperable', () => {
  it.each([
    ['processing', view('processing'), { result: 'not_requested' } as const, true],
    ['pending', view('pending'), { result: 'not_requested' } as const, true],
    ['failed', view('failed'), { result: 'not_requested' } as const, false],
    ['confirmación fallida', view('succeeded'), { result: 'confirmation_failed' } as const, true],
    ['not_confirmable', view('succeeded'), { result: 'not_confirmable', reason: 'expired' } as const, false],
  ])('%s', (_n, payment, confirmation, recoverable) => {
    expect(toPatientPaymentResponse({ payment, confirmation, appointmentConfirmed: false }).recoverable).toBe(recoverable);
  });
});
