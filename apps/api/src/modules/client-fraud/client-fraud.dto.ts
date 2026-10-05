import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  FP_KINDS,
  FRAUD_EVENT,
  FRAUD_NOTE_MAX,
  FRAUD_PRESETS,
  FRAUD_STATUSES,
  MATCH_ACTIONS,
  SIGNAL_CODES,
  type FpKind,
  type FraudPreset,
  type FraudStatus,
  type MatchAction,
  type SignalCode,
} from './client-fraud.constants';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const EVENT_KINDS = Object.values(FRAUD_EVENT);

export class FraudUserIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

export class FraudNoteDto {
  @ApiPropertyOptional({ maxLength: FRAUD_NOTE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(FRAUD_NOTE_MAX)
  note?: string;
}

export class FraudReasonDto {
  @ApiProperty({ minLength: 3, maxLength: FRAUD_NOTE_MAX })
  @Transform(trim)
  @IsString()
  @Length(3, FRAUD_NOTE_MAX)
  note!: string;
}

export class FraudBanDto extends FraudReasonDto {
  @ApiPropertyOptional({
    description:
      'Also block every account that shares a phone, e-mail, Apple / Google account, card or device with this one.',
  })
  @IsOptional()
  @IsBoolean()
  includeLinked?: boolean;
}

export class FraudQueueQueryDto {
  @ApiPropertyOptional({
    enum: [...FRAUD_STATUSES, 'queue', 'all'],
    enumName: 'FraudQueueFilter',
    description: "Default 'queue' = review + restricted.",
  })
  @IsOptional()
  @IsIn([...FRAUD_STATUSES, 'queue', 'all'])
  status?: FraudStatus | 'queue' | 'all';

  @ApiPropertyOptional({ description: 'Name, e-mail, phone or user id.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class FraudEventsQueryDto {
  @ApiPropertyOptional({
    enum: ['staff', 'system', 'all'],
    enumName: 'FraudEventsActorFilter',
  })
  @IsOptional()
  @IsIn(['staff', 'system', 'all'])
  actor?: 'staff' | 'system' | 'all';

  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class FraudUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['client', 'attorney', 'assistant'],
  })
  role!: string | null;

  @ApiProperty({ description: 'users.status (active / suspended / …).' })
  accountStatus!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Masked.' })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Masked.' })
  phone!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class FraudSignalDto {
  @ApiProperty({ enum: SIGNAL_CODES, enumName: 'FraudSignalCode' })
  code!: SignalCode;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  points!: number;
}

export class FraudQueueItemDto {
  @ApiProperty({ type: FraudUserDto })
  user!: FraudUserDto;

  @ApiProperty()
  score!: number;

  @ApiProperty({ enum: FRAUD_STATUSES, enumName: 'FraudStatus' })
  status!: FraudStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['score', 'linked', 'staff'],
    enumName: 'FraudQueueReason',
  })
  queueReason!: 'score' | 'linked' | 'staff' | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  queuedAt!: string | null;

  @ApiProperty({ type: [FraudSignalDto] })
  signals!: FraudSignalDto[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  linkedUserId!: string | null;

  @ApiProperty({ format: 'date-time' })
  computedAt!: string;
}

export class FraudLinkedAccountDto {
  @ApiProperty({ type: FraudUserDto })
  user!: FraudUserDto;

  @ApiProperty({
    enum: FP_KINDS,
    enumName: 'FingerprintKind',
    isArray: true,
    description: 'What the two accounts share (never the values).',
  })
  kinds!: FpKind[];

  @ApiProperty({ description: 'That account is blocked.' })
  blocked!: boolean;
}

export class FraudEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  userId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userName!: string | null;

  @ApiProperty({ enum: EVENT_KINDS, enumName: 'FraudEventKind' })
  kind!: string;

  @ApiProperty({ enum: ['system', 'admin'], enumName: 'FraudActorType' })
  actorType!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  actorId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  actorName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  score!: number | null;

  @ApiProperty({
    enum: FP_KINDS,
    enumName: 'FingerprintKind',
    isArray: true,
    description: 'Signals a refused sign-in matched.',
  })
  kinds!: FpKind[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class FraudCardDto extends FraudQueueItemDto {
  @ApiProperty({ type: [FraudLinkedAccountDto] })
  linked!: FraudLinkedAccountDto[];

  @ApiProperty({ type: [FraudEventDto] })
  events!: FraudEventDto[];

  @ApiProperty({ type: Number, nullable: true })
  clearedScore!: number | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  clearedAt!: string | null;
}

export class FraudBanResultDto {
  @ApiProperty({ description: 'Accounts blocked (this one and linked).' })
  banned!: number;
}

export class FraudRecomputeAllResultDto {
  @ApiProperty()
  accounts!: number;

  @ApiProperty()
  changed!: number;
}

export class FraudStatsDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  auto!: boolean;

  @ApiProperty({ description: 'Waiting for a check (account works).' })
  review!: number;

  @ApiProperty({ description: 'Restricted until a check.' })
  restricted!: number;

  @ApiProperty({ description: 'Blocked by this module (all time).' })
  banned!: number;

  @ApiProperty({ description: 'Sign-ins of blocked people refused, 30 days.' })
  blockedSignIns30d!: number;

  @ApiProperty({ description: 'Accounts blocked automatically, 30 days.' })
  autoBanned30d!: number;
}

export class FraudSettingsDto {
  @ApiProperty({ description: 'Master switch.' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    description: 'Actions apply by themselves (off = queue only).',
  })
  @IsBoolean()
  auto!: boolean;

  @ApiProperty({ enum: MATCH_ACTIONS, enumName: 'FraudMatchAction' })
  @IsIn(MATCH_ACTIONS)
  matchAction!: MatchAction;

  @ApiProperty({ enum: MATCH_ACTIONS, enumName: 'FraudMatchAction' })
  @IsIn(MATCH_ACTIONS)
  deviceAction!: MatchAction;

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  reviewScore!: number;

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  restrictScore!: number;

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  banScore!: number;

  @ApiProperty({ minimum: 0, maximum: 200 })
  @IsInt()
  @Min(0)
  @Max(200)
  weightFraudReport!: number;

  @ApiProperty({ minimum: 0, maximum: 200 })
  @IsInt()
  @Min(0)
  @Max(200)
  weightReport!: number;

  @ApiProperty({ minimum: 0, maximum: 200 })
  @IsInt()
  @Min(0)
  @Max(200)
  weightChargeback!: number;

  @ApiProperty({ minimum: 7, maximum: 3650 })
  @IsInt()
  @Min(7)
  @Max(3650)
  windowDays!: number;

  @ApiProperty()
  @IsBoolean()
  notifyStaff!: boolean;

  @ApiProperty({ minimum: 30, maximum: 3650 })
  @IsInt()
  @Min(30)
  @Max(3650)
  fingerprintRetentionDays!: number;

  @ApiProperty({ minimum: 30, maximum: 3650 })
  @IsInt()
  @Min(30)
  @Max(3650)
  blockedRetentionDays!: number;
}

export class FraudPresetDto {
  @ApiProperty({ enum: FRAUD_PRESETS, enumName: 'FraudPreset' })
  @IsIn(FRAUD_PRESETS)
  preset!: FraudPreset;
}
