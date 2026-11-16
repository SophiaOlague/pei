import { InvalidAmountError } from './payments.errors';

// Importes en CENTAVOS enteros (MXN), sin coma flotante. El esquema guarda numeric(12,2) (PAY-13): el máximo
// representable es 9 999 999 999.99. Las conversiones desde texto o desde el JSON del proveedor validan que no haya
// más de dos decimales; nunca redondean en silencio.
export const CURRENCY = 'MXN' as const;
export type Currency = typeof CURRENCY;
export const MAX_CENTS = 999_999_999_999;

export interface Money {
  readonly cents: number;
  readonly currency: Currency;
}

export function money(cents: number, currency: string = CURRENCY): Money {
  if (currency !== CURRENCY) throw new InvalidAmountError(`moneda no admitida: ${currency}`);
  if (!Number.isSafeInteger(cents)) throw new InvalidAmountError('el importe debe ser un número entero de centavos');
  if (Math.abs(cents) > MAX_CENTS) throw new InvalidAmountError('el importe excede numeric(12,2)');
  return Object.freeze({ cents, currency: CURRENCY });
}

// "1000", "1000.5", "1000.50" → centavos. Rechaza más de dos decimales, exponentes y signos raros.
export function fromDecimalString(value: string, currency: string = CURRENCY): Money {
  const m = /^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new InvalidAmountError('importe decimal inválido');
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return money(m[1] === '-' ? -cents : cents, currency);
}

// Número JSON del proveedor (p. ej. 40.64) → centavos. Rechaza valores no finitos o con más de dos decimales.
export function fromProviderNumber(value: unknown, currency: string = CURRENCY): Money {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidAmountError('importe del proveedor no numérico');
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6) throw new InvalidAmountError('importe del proveedor con más de dos decimales');
  return money(cents, currency);
}

export const toDecimalString = (m: Money): string => {
  const sign = m.cents < 0 ? '-' : '';
  const abs = Math.abs(m.cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

// Número para el cuerpo JSON del proveedor (transaction_amount). Exacto para importes en centavos.
export const toProviderNumber = (m: Money): number => Number(toDecimalString(m));

export const add = (a: Money, b: Money): Money => money(a.cents + b.cents);
export const subtract = (a: Money, b: Money): Money => money(a.cents - b.cents);
export const ZERO: Money = money(0);
