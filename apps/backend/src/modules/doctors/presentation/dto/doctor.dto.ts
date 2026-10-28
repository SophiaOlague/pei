import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { isValidCurp, normalizeCurp } from '../../../identity/domain/curp';
import { LEGAL_NAME_PART_MAX } from '../../domain/legal-name';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const curp = ({ value }: { value: unknown }) => (typeof value === 'string' ? normalizeCurp(value) : value);

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

// POST /me/doctor-profile (plan v2 §12). Sin rol ni número de cédula: la cédula se envía con su endpoint.
export class RegisterDoctorProfileDto {
  @Transform(trim) @IsString() @Length(1, LEGAL_NAME_PART_MAX) firstName!: string;
  @Transform(trim) @IsString() @Length(1, LEGAL_NAME_PART_MAX) lastName!: string;
  @Transform(curp) @IsString() @Validate(CurpConstraint) curp!: string;
  @IsUUID() specialtyId!: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 30) phone?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 1000) bio?: string;
}

// PATCH /me/doctor-profile: solo los campos libres (D-9). null borra el valor. Al menos uno (lo exige el caso de uso).
export class UpdateDoctorProfileDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 30) phone?: string | null;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 1000) bio?: string | null;
}

export class ChangeDoctorSpecialtyDto {
  @IsUUID() specialtyId!: string;
}

// POST /me/doctor/license-verifications (multipart): el campo de texto; el archivo `document` lo valida el caso de uso.
export class SubmitLicenseVerificationDto {
  @Transform(trim) @IsString() @Length(1, 20) licenseNumber!: string;
}
