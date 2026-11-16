import { CURRENCY, money, subtract, ZERO, type Money } from './money';
import { InvalidAmountError, NegativeDoctorNetError } from './payments.errors';

// Modelo financiero de un pago (Payments-decisiones.md §2). Cuatro importes que NO se mezclan:
// - gross: lo que paga el paciente (precio publicado);
// - peiFixedFee: comisión fija de PEI, snapshot de pei_fee_configuration (solo consultas; sin valor por defecto);
// - doctorNet: gross − peiFixedFee en consultas; 0 en medicamentos y PrEP;
// - providerFee: comisión del procesador. Es COSTO DE PEI (PAY-07): nunca reduce doctorNet. Se estima al crear el pago
//   con processor_fee_schedule y se concilia con la comisión real informada por el proveedor.

export type PaymentType = 'consultation' | 'medication';

// Snapshot de la configuración vigente al crear el pago (las filas las define un administrador; aquí no hay valores).
export interface PeiFeeSnapshot {
  configurationId: string;
  fixedFee: Money;
}

export interface ProcessorFeeSnapshot {
  scheduleId: string;
  // Como texto decimal, tal como numeric(7,6): p. ej. "0.031900".
  percentageRate: string;
  fixedFee: Money;
  vatRate: string;
}

export interface PaymentSplit {
  gross: Money;
  peiFixedFee: Money | null;
  peiFeeConfigurationId: string | null;
  doctorNet: Money;
}

export function consultationSplit(gross: Money, fee: PeiFeeSnapshot): PaymentSplit {
  if (gross.cents <= 0) throw new InvalidAmountError('el importe bruto debe ser positivo');
  if (fee.fixedFee.cents < 0) throw new InvalidAmountError('la comisión fija de PEI no puede ser negativa');
  if (fee.fixedFee.cents > gross.cents) throw new NegativeDoctorNetError();
  return { gross, peiFixedFee: fee.fixedFee, peiFeeConfigurationId: fee.configurationId, doctorNet: subtract(gross, fee.fixedFee) };
}

export function medicationSplit(gross: Money): PaymentSplit {
  if (gross.cents <= 0) throw new InvalidAmountError('el importe bruto debe ser positivo');
  return { gross, peiFixedFee: null, peiFeeConfigurationId: null, doctorNet: ZERO };
}

// Tasa decimal (hasta 6 decimales, en [0, 1)) → millonésimas enteras.
export function rateToMicros(rate: string): bigint {
  const m = /^0?\.(\d{1,6})$|^0$/.exec(rate.trim());
  if (!m) throw new InvalidAmountError(`tasa inválida: ${rate}`);
  return BigInt((m[1] ?? '').padEnd(6, '0') || '0');
}

// Estimación: (gross · rate + fixed) · (1 + vat), redondeada al centavo con mitad hacia arriba, en aritmética entera.
export function estimateProcessorFee(gross: Money, schedule: ProcessorFeeSnapshot): Money {
  const rate = rateToMicros(schedule.percentageRate);
  const vat = rateToMicros(schedule.vatRate);
  const base = BigInt(gross.cents) * rate + BigInt(schedule.fixedFee.cents) * 1_000_000n; // centavos · 1e6
  const withVat = base * (1_000_000n + vat); // centavos · 1e12
  const scale = 1_000_000_000_000n;
  const cents = (withVat + scale / 2n) / scale;
  return money(Number(cents), CURRENCY);
}
