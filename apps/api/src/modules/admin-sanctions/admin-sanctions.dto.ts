import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BAN_KINDS } from '../account-bans/account-bans.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class BanIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class SanctionUserIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class BansQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'ended', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'ended', 'all'])
  status?: 'active' | 'ended' | 'all';

  @ApiPropertyOptional({ enum: BAN_KINDS })
  @IsOptional()
  @IsIn(BAN_KINDS)
  kind?: (typeof BAN_KINDS)[number];

  @ApiPropertyOptional({
    maxLength: 80,
    description: 'Phone, e-mail, device id or user id.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class CreateBanDto {
  @ApiProperty({ enum: BAN_KINDS })
  @IsIn(BAN_KINDS)
  kind!: (typeof BAN_KINDS)[number];

  @ApiProperty({
    maxLength: 200,
    description:
      'Phone in +E.164, e-mail, device id or user id, as the kind says.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  value!: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 3650,
    description: 'Days; empty = no end date.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;
}

export class LiftBanDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class BlockUserDto {
  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 3650,
    description: 'Days; empty = no end date.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  banPhone?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  banEmail?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Every device the user signed in from.',
  })
  @IsOptional()
  @IsBoolean()
  banDevices?: boolean;
}

export class AdminBanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: BAN_KINDS }) kind!: string;
  @ApiProperty() value!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  userId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) userName!:
    string | null;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) expiresAt!:
    string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) liftedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) liftReason!:
    string | null;
  @ApiProperty({ description: 'Not lifted and not expired.' }) active!: boolean;
}

export class BlockResultDto {
  @ApiProperty({ type: [AdminBanDto] }) bans!: AdminBanDto[];
  @ApiProperty({ type: 'integer' }) revokedSessions!: number;
}
