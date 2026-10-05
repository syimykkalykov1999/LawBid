import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DEMO_LIMITS, DEMO_ROLES, type DemoRole } from './demo.settings';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DemoAccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DEMO_ROLES, enumName: 'DemoRole' })
  role!: DemoRole;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastSeenAt!: string | null;

  @ApiProperty({
    format: 'date-time',
    description: 'When the sweep deletes it unless it is used again.',
  })
  expiresAt!: string;
}

export class DemoMeDto {
  @ApiProperty({
    description:
      'Master switch on and this account is an active partner with demo access.',
  })
  enabled!: boolean;

  @ApiProperty()
  canCreate!: boolean;

  @ApiProperty()
  maxAccounts!: number;

  @ApiProperty()
  ttlDays!: number;

  @ApiProperty({ type: [DemoAccountDto] })
  accounts!: DemoAccountDto[];
}

export class DemoTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  accessTokenExpiresIn!: number;
}

export class DemoSessionDto {
  @ApiProperty({ type: DemoAccountDto })
  account!: DemoAccountDto;

  @ApiProperty({ type: DemoTokensDto })
  tokens!: DemoTokensDto;
}

export class DemoCurrentDto {
  @ApiProperty({ type: DemoAccountDto })
  account!: DemoAccountDto;

  @ApiProperty({ description: "The banner text in the user's language." })
  bannerText!: string;
}

export class CreateDemoAccountDto {
  @ApiProperty({ enum: DEMO_ROLES, enumName: 'DemoRole' })
  @IsIn(DEMO_ROLES)
  role!: DemoRole;

  @ApiPropertyOptional({ maxLength: DEMO_LIMITS.name })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(DEMO_LIMITS.name)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: DEMO_LIMITS.name })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(DEMO_LIMITS.name)
  lastName?: string;
}

export class DemoAccountIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/i)
  id!: string;
}

export class RedeemDemoInviteDto {
  @ApiProperty({ description: '8 letters/digits the admin handed out.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]/g, '').toUpperCase()
      : value,
  )
  @IsString()
  @Length(6, 12)
  code!: string;
}

// ---- admin ----------------------------------------------------------------

export class DemoBannerTextDto {
  @ApiProperty({ maxLength: DEMO_LIMITS.bannerText })
  @Transform(trim)
  @IsString()
  @MaxLength(DEMO_LIMITS.bannerText)
  en!: string;

  @ApiProperty({ maxLength: DEMO_LIMITS.bannerText })
  @Transform(trim)
  @IsString()
  @MaxLength(DEMO_LIMITS.bannerText)
  ru!: string;
}

export class DemoSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    minimum: DEMO_LIMITS.ttlDays.min,
    maximum: DEMO_LIMITS.ttlDays.max,
  })
  @IsInt()
  @Min(DEMO_LIMITS.ttlDays.min)
  @Max(DEMO_LIMITS.ttlDays.max)
  ttlDays!: number;

  @ApiProperty({
    minimum: DEMO_LIMITS.maxAccountsPerPartner.min,
    maximum: DEMO_LIMITS.maxAccountsPerPartner.max,
  })
  @IsInt()
  @Min(DEMO_LIMITS.maxAccountsPerPartner.min)
  @Max(DEMO_LIMITS.maxAccountsPerPartner.max)
  maxAccountsPerPartner!: number;

  @ApiProperty()
  @IsBoolean()
  autoClean!: boolean;

  @ApiProperty({
    minimum: DEMO_LIMITS.uploadQuotaMb.min,
    maximum: DEMO_LIMITS.uploadQuotaMb.max,
  })
  @IsInt()
  @Min(DEMO_LIMITS.uploadQuotaMb.min)
  @Max(DEMO_LIMITS.uploadQuotaMb.max)
  uploadQuotaMb!: number;

  @ApiProperty({ type: DemoBannerTextDto })
  @ValidateNested()
  @Type(() => DemoBannerTextDto)
  bannerText!: DemoBannerTextDto;
}

export class DemoStatusDto {
  @ApiProperty()
  ready!: boolean;

  @ApiProperty({ nullable: true, type: String })
  reason!: string | null;

  @ApiProperty({ nullable: true, type: String })
  databaseName!: string | null;

  @ApiProperty()
  accounts!: number;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastResetAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastSweepAt!: string | null;

  @ApiProperty()
  migrationsApplied!: number;

  @ApiProperty()
  migrationsPending!: number;

  @ApiProperty({
    nullable: true,
    type: Object,
    description: 'What the last seed created (users, cases, posts …).',
  })
  seedCounts!: Record<string, number> | null;
}

export class DemoCreatedByDto {
  @ApiProperty({ enum: ['partner', 'admin'] })
  kind!: 'partner' | 'admin';

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  userId!: string | null;

  @ApiProperty()
  name!: string;
}

export class AdminDemoAccountDto extends DemoAccountDto {
  @ApiProperty({ type: DemoCreatedByDto })
  createdBy!: DemoCreatedByDto;

  @ApiProperty({ nullable: true, type: String })
  label!: string | null;

  @ApiProperty()
  hasInvite!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  inviteExpiresAt!: string | null;
}

export class AdminDemoAccountsQueryDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class AdminDemoAccountsPageDto {
  @ApiProperty({ type: [AdminDemoAccountDto] })
  items!: AdminDemoAccountDto[];

  @ApiProperty()
  total!: number;
}

export class AdminCreateDemoAccountDto extends CreateDemoAccountDto {
  @ApiPropertyOptional({ maxLength: DEMO_LIMITS.label })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(DEMO_LIMITS.label)
  label?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Also mint a code the blogger enters in the app.',
  })
  @IsOptional()
  @IsBoolean()
  withInvite?: boolean;
}

export class AdminDemoAccountCreatedDto {
  @ApiProperty({ type: AdminDemoAccountDto })
  account!: AdminDemoAccountDto;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Shown once; only its hash is stored.',
  })
  inviteCode!: string | null;
}

export class AdminDemoInviteDto {
  @ApiProperty({ description: 'Shown once; only its hash is stored.' })
  inviteCode!: string;

  @ApiProperty({ format: 'date-time' })
  inviteExpiresAt!: string;
}
