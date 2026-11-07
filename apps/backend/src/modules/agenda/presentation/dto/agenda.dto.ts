import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsISO8601, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

// M07: forma de las peticiones. Las reglas de negocio (solapamientos, máximo por día, múltiplos de 5, horizonte) viven
// en el dominio; aquí solo se exige la forma y se rechazan propiedades desconocidas (whitelist + forbidNonWhitelisted).
const TIME = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class WeeklyWindowDto {
  @IsInt()
  weekday!: number;

  @IsString()
  @Matches(TIME, { message: 'start debe tener formato HH:MM' })
  start!: string;

  @IsString()
  @Matches(TIME, { message: 'end debe tener formato HH:MM' })
  end!: string;
}

export class ReplaceAvailabilityDto {
  @IsArray()
  @ArrayMaxSize(42) // 6 franjas × 7 días
  @ValidateNested({ each: true })
  @Type(() => WeeklyWindowDto)
  windows!: WeeklyWindowDto[];
}

export class ChangeDurationDto {
  @IsInt()
  minutes!: number;
}

export class AddTimeOffDto {
  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class SlotsQueryDto {
  @IsString()
  @Matches(DATE, { message: 'from debe tener formato AAAA-MM-DD' })
  from!: string;

  @IsString()
  @Matches(DATE, { message: 'to debe tener formato AAAA-MM-DD' })
  to!: string;
}
