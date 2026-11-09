import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

// M08: los DTO rechazan propiedades desconocidas (ValidationPipe con whitelist + forbidNonWhitelisted). Las reglas de
// negocio (motivos, rangos, coherencia de parámetros) se validan también en el dominio.

export class HoldSlotDto {
  @IsUUID()
  doctorProfileId!: string;

  @IsDateString({ strict: true })
  startsAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

// DA-6: solo el nuevo horario; médico, motivo, precio, política y referencias legales salen de la cita original.
export class RescheduleDto {
  @IsDateString({ strict: true })
  startsAt!: string;
}

export class PatientCancelDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DoctorCancelDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class SlotsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

export class BookableDoctorsQueryDto {
  @IsOptional()
  @IsUUID()
  specialtyId?: string;
}

export class DoctorAppointmentsQueryDto {
  @IsDateString({ strict: true })
  from!: string;

  @IsDateString({ strict: true })
  to!: string;
}

export class PublishPriceDto {
  // Cadena decimal ("250.00"): se evita la coma flotante en importes.
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  price!: string;
}

export class PublishPolicyDto {
  @IsInt()
  refundDeadlineHours!: number;

  @IsInt()
  maxReschedules!: number;

  @IsInt()
  doctorWaitMinutes!: number;

  @IsInt()
  patientToleranceMinutes!: number;

  // AP-22: opcionales; si se omiten, 60 y 5 (DEFAULT de 0013).
  @IsOptional()
  @IsInt()
  maxProtectedWaitMinutes?: number;

  @IsOptional()
  @IsInt()
  reconnectGraceMinutes?: number;
}
