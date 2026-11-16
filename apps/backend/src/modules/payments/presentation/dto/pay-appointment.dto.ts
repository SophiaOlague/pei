import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// Datos que el cliente envía tras tokenizar la tarjeta con el proveedor (Stripe.js/Elements: el id de un PaymentMethod,
// pm_…). Sirve para los dos checkouts: consulta y pedido de medicamentos. NO hay importe, moneda ni datos de la
// tarjeta: el importe lo toma el backend de la cita o del pedido y la tarjeta solo existe como referencia del
// proveedor. Con forbidNonWhitelisted (create-validation-pipe), un campo extra (p. ej. amount, transaction_amount o
// card_number) es un 400.
//
// Con Stripe basta `token`. paymentMethodId, issuerId, installments y payerEmail son los datos de Card Payment Brick
// (Mercado Pago, conservado sin uso): siguen admitidos y validados, pero son opcionales.
export class PayAppointmentDto {
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  @Matches(/^[A-Za-z0-9_-]+$/)
  token!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9_]+$/)
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/)
  issuerId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  installments?: number;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  payerEmail?: string;
}

// El pago de un pedido usa exactamente los mismos datos.
export class PayMedicationOrderDto extends PayAppointmentDto {}
