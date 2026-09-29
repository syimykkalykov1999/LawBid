import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Upper bound for a dispute reason / admin note (free text). */
export const DISPUTE_TEXT_MAX = 1000;

/** POST /cases/:id/dispute body — docs/04 §10.1 "причина обязательна". */
export class DisputeCaseDto {
  @ApiProperty({ minLength: 1, maxLength: DISPUTE_TEXT_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(DISPUTE_TEXT_MAX)
  reason!: string;
}

export const DISPUTE_DECISIONS = ['closed', 'in_progress'] as const;

/** POST /admin/case-disputes/:id/resolve body — docs/04 §10.1: the case
 * goes to `closed` or back to `in_progress`. */
export class ResolveCaseDisputeDto {
  @ApiProperty({ enum: DISPUTE_DECISIONS })
  @IsIn(DISPUTE_DECISIONS)
  decision!: (typeof DISPUTE_DECISIONS)[number];

  @ApiProperty({ minLength: 1, maxLength: DISPUTE_TEXT_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(DISPUTE_TEXT_MAX)
  note!: string;
}

export class CaseDisputeIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}
