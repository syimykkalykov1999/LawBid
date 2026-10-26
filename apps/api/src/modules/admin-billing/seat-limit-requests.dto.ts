import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { SEATS_HARD_CAP } from '../billing/billing.constants';
import { AdminBillingUserDto } from './admin-billing.dto';

export const SEAT_LIMIT_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;
export type SeatLimitRequestStatus =
  (typeof SEAT_LIMIT_REQUEST_STATUSES)[number];

/** POST /billing/seat-limit-requests — the attorney asks for more. */
export class CreateSeatLimitRequestDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: SEATS_HARD_CAP })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEATS_HARD_CAP)
  seats!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SeatLimitRequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: SEAT_LIMIT_REQUEST_STATUSES,
    enumName: 'SeatLimitRequestStatus',
  })
  status!: SeatLimitRequestStatus;
  @ApiProperty({ type: 'integer' }) requestedSeats!: number;
  @ApiProperty({ type: 'integer', nullable: true })
  grantedSeats!: number | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true })
  decisionNote!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;
}

/** GET /billing/seat-limit-requests/latest — the attorney's limit and
 * their latest request. */
export class SeatLimitStateDto {
  @ApiProperty({ type: 'integer', description: "The attorney's limit." })
  limit!: number;
  @ApiProperty({ description: 'An admin set a personal limit.' })
  isPersonal!: boolean;
  @ApiProperty({ type: SeatLimitRequestDto, nullable: true })
  request!: SeatLimitRequestDto | null;
}

/** The admin's queue row: the request plus who asked and their seats. */
export class AdminSeatLimitRequestDto extends SeatLimitRequestDto {
  @ApiProperty({ format: 'uuid' }) attorneyId!: string;
  @ApiProperty({ type: AdminBillingUserDto, nullable: true })
  user!: AdminBillingUserDto | null;
  @ApiProperty({
    type: 'integer',
    description: "The attorney's limit today (own or global).",
  })
  currentLimit!: number;
  @ApiProperty({ type: 'integer' }) assistantsUsed!: number;
}

export class AdminSeatLimitRequestsQueryDto {
  @ApiPropertyOptional({
    enum: SEAT_LIMIT_REQUEST_STATUSES,
    enumName: 'SeatLimitRequestStatus',
  })
  @IsOptional()
  @IsIn(SEAT_LIMIT_REQUEST_STATUSES)
  status?: SeatLimitRequestStatus;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ApproveSeatLimitDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: SEATS_HARD_CAP,
    description: "The attorney's new limit.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEATS_HARD_CAP)
  seats!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectSeatLimitDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
