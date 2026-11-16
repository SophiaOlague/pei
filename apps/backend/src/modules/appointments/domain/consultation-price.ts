import { InvalidConsultationPriceError } from './appointments.errors';

// RN-007 y RF-66 (propuesto, C-23): precio global de consulta, único para toda la plataforma (sin precio por médico ni
// por especialidad). Versiones con vigencia: cada cambio cierra la vigente e inserta una nueva con vigencia inmediata
// (AP-9). La cita conserva una copia en appointment.price. Precio inicial aprobado: 200.00 MXN (AP-1).

export const CONSULTATION_CURRENCY = 'MXN';
export const INITIAL_CONSULTATION_PRICE = '200.00';
// numeric(10,2): como máximo 8 dígitos enteros.
const PRICE_PATTERN = /^(0|[1-9]\d{0,7})(\.\d{1,2})?$/;

export interface PriceVersion {
  id: string;
  price: string; // decimal con 2 cifras, como lo devuelve numeric
  currency: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  createdBy: string;
}

// Normaliza a 2 decimales ("250" → "250.00") y rechaza cero, negativos, más de 2 decimales y desbordamiento.
export function normalizePrice(value: unknown): string {
  if (typeof value !== 'string' || !PRICE_PATTERN.test(value.trim())) {
    throw new InvalidConsultationPriceError('debe ser un número positivo con hasta 2 decimales y 8 dígitos enteros');
  }
  const [int, dec = ''] = value.trim().split('.');
  const normalized = `${int}.${dec.padEnd(2, '0')}`;
  if (Number(normalized) <= 0) throw new InvalidConsultationPriceError('debe ser mayor que cero');
  return normalized;
}

// P-1: vigente = effective_from <= ahora y (sin fin o fin > ahora).
export function isEffective(v: { effectiveFrom: Date; effectiveUntil: Date | null }, now: Date): boolean {
  return v.effectiveFrom.getTime() <= now.getTime() && (v.effectiveUntil === null || v.effectiveUntil.getTime() > now.getTime());
}

export function samePrice(a: string, b: string): boolean {
  return normalizePrice(a) === normalizePrice(b);
}
