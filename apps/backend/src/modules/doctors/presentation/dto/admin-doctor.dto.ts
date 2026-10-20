import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { REJECTION_REASON_MAX, REJECTION_REASON_MIN } from '../../domain/review';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

// GET /admin/doctors
export class ListDoctorsQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['pending', 'approved', 'rejected']) status?: 'pending' | 'approved' | 'rejected';
}

// D-25: motivo obligatorio de 10 a 500 caracteres.
export class RejectDoctorReviewDto {
  @Transform(trim) @IsString() @Length(REJECTION_REASON_MIN, REJECTION_REASON_MAX) reason!: string;
}

export class DoctorIdentityDocumentParamsDto {
  @IsUUID() id!: string;
  @IsIn(['front', 'back']) side!: 'front' | 'back';
}
