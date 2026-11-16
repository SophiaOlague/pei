import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ADMIN_REFUND_REASONS, type AdminRefundReason } from '../../application/use-cases/admin-refunds.service';

// H-7: solicitud administrativa de reembolso. El importe solo viaja en un parcial, como texto decimal de MXN con hasta
// dos decimales (nunca coma flotante); el total lo calcula el backend del pago. Con forbidNonWhitelisted
// (create-validation-pipe), cualquier campo extra (p. ej. approvedBy, peiFeeShare o doctorShare) es un 400: la
// prorrata y la aprobación no se aceptan del cliente.
export class RequestAdminRefundDto {
  @IsIn(['full', 'partial'])
  kind!: 'full' | 'partial';

  @ValidateIf((o: RequestAdminRefundDto) => o.kind === 'partial' || o.amount !== undefined)
  @IsString()
  @Matches(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
  amount?: string;

  @IsIn(ADMIN_REFUND_REASONS)
  reason!: AdminRefundReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// Rechazo de un parcial pendiente de aprobación: el motivo es obligatorio (refund.failure_reason / auditoría).
export class RejectAdminRefundDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
