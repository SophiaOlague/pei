import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { SPECIALTY_CODE_PATTERN, SPECIALTY_NAME_MAX } from '../../domain/specialty';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// POST /admin/specialties
export class CreateSpecialtyDto {
  @IsString()
  @Matches(SPECIALTY_CODE_PATTERN, {
    message: 'code debe tener de 2 a 50 caracteres: minúsculas, dígitos o guion bajo, empezando por letra',
  })
  code!: string;

  @Transform(trim)
  @IsString()
  @Length(1, SPECIALTY_NAME_MAX)
  name!: string;
}

// PATCH /admin/specialties/:id. Solo el nombre visible (R-4): enviar `code` responde 400 (whitelist).
export class UpdateSpecialtyDto {
  @Transform(trim)
  @IsString()
  @Length(1, SPECIALTY_NAME_MAX)
  name!: string;
}
