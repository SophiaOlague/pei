import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isValidCurp, normalizeCurp } from '../../domain/curp';
import { REJECTION_REASON_MAX, REJECTION_REASON_MIN, type DocumentSide } from '../../domain/identity-verification';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

@ValidatorConstraint({ name: 'curp' })
class CurpConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidCurp(value);
  }

  // Sin el valor recibido: la respuesta no repite la CURP.
  defaultMessage(): string {
    return 'curp no tiene un formato válido';
  }
}

// POST /me/patient-profile. Sin campo de rol (DP-5): cualquier propiedad no declarada responde 400.
export class RegisterPatientProfileDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  lastName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeCurp(value) : value))
  @IsString()
  @Validate(CurpConstraint)
  curp!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDate debe tener el formato AAAA-MM-DD' })
  birthDate!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 30)
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  address?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  emergencyContactName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 30)
  emergencyContactPhone?: string;
}

// PATCH /me/profile (DP-12): solo los cuatro campos editables. CURP, nombre legal o fecha de nacimiento
// responden 400 por forbidNonWhitelisted. null borra el valor.
export class UpdatePatientProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 30)
  phone?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  address?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  emergencyContactName?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 30)
  emergencyContactPhone?: string | null;
}

// POST /me/legal-acceptances: una o dos versiones (aviso de privacidad y términos), sin repetir.
export class AcceptLegalDocumentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  documentIds!: string[];
}

export class RejectIdentityVerificationDto {
  @Transform(trim)
  @IsString()
  @Length(REJECTION_REASON_MIN, REJECTION_REASON_MAX)
  reason!: string;
}

export class ListPendingIdentityVerificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;
}

export class IdentityDocumentParamsDto {
  @IsUUID('all')
  id!: string;

  @IsIn(['front', 'back'])
  side!: DocumentSide;
}
