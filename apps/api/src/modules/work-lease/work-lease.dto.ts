import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SKIP_REASONS } from '../../common/staff-events';
import { LEASE_QUEUE_KINDS } from './lease-queue-sources';

const KIND_DOC =
  'Queue kind: support_ticket · verification · report · mod_appeal · review_appeal.';

export class LeaseKindBodyDto {
  @ApiProperty({
    enum: LEASE_QUEUE_KINDS,
    enumName: 'LeaseQueueKind',
    description: KIND_DOC,
  })
  @IsIn(LEASE_QUEUE_KINDS)
  kind!: string;
}

export class LeaseItemParamDto {
  @ApiProperty({
    enum: LEASE_QUEUE_KINDS,
    enumName: 'LeaseQueueKind',
    description: KIND_DOC,
  })
  @IsIn(LEASE_QUEUE_KINDS)
  kind!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class SkipLeaseDto {
  @ApiProperty({ enum: SKIP_REASONS, enumName: 'LeaseSkipReason' })
  @IsIn(SKIP_REASONS)
  reason!: string;
}

export class SetDeskStatusDto {
  @ApiProperty({ description: 'true = «отошёл» by hand, false = back on.' })
  @IsBoolean()
  away!: boolean;
}

export class LeaseDto {
  @ApiProperty({ enum: LEASE_QUEUE_KINDS, enumName: 'LeaseQueueKind' })
  kind!: string;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ format: 'date-time' })
  takenAt!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'The lease ends here unless renewed.',
  })
  leasedUntil!: string;

  @ApiProperty({
    description: 'How many times this item was taken (1 = first time).',
  })
  attempt!: number;
}

export class NextLeaseResultDto {
  @ApiProperty({
    enum: ['leased', 'busy', 'empty', 'wrap_up', 'away', 'offline'],
    enumName: 'LeaseNextStatus',
    description:
      'leased = a new item is yours; busy = your hands are full (see `held`); empty = nothing waits; wrap_up = wait `retryAfterSec`; away / offline = come back online first.',
  })
  status!: string;

  @ApiPropertyOptional({ type: LeaseDto, nullable: true })
  lease?: LeaseDto | null;

  @ApiPropertyOptional({ type: [LeaseDto] })
  held?: LeaseDto[];

  @ApiPropertyOptional()
  retryAfterSec?: number;
}

export class DeskStatusDto {
  @ApiProperty({
    enum: ['online', 'away', 'offline'],
    enumName: 'DeskPresence',
  })
  status!: string;
}

export class LeaseCapacityDto {
  @ApiProperty({ description: 'Support dialogs held at once.' })
  chat!: number;

  @ApiProperty({ description: 'Items of any other queue held at once.' })
  other!: number;
}

export class MyLeasesDto {
  @ApiProperty({
    enum: ['online', 'away', 'offline'],
    enumName: 'DeskPresence',
  })
  status!: string;

  @ApiProperty({ type: [LeaseDto] })
  leases!: LeaseDto[];

  @ApiProperty({
    type: LeaseCapacityDto,
    description: 'Items in hands allowed at once: support dialogs / the rest.',
  })
  capacity!: LeaseCapacityDto;

  @ApiProperty({ description: 'Seconds of support wrap-up left (0 = none).' })
  wrapUpSec!: number;
}

export class LeaseOkDto {
  @ApiProperty()
  ok!: boolean;
}

export class SkipLeaseResultDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({
    description: 'true = the per-hour limit of skips is used up.',
  })
  limited!: boolean;
}

export class TeamTileItemDto {
  @ApiProperty({ enum: LEASE_QUEUE_KINDS, enumName: 'LeaseQueueKind' })
  kind!: string;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  takenAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  leasedUntil!: string | null;

  @ApiProperty({ description: 'Minutes in this person’s hands.' })
  heldMinutes!: number;
}

export class TeamTileDto {
  @ApiProperty({ format: 'uuid' })
  adminId!: string;

  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty()
  role!: string;

  @ApiProperty({
    enum: ['online', 'away', 'offline'],
    enumName: 'DeskPresence',
  })
  status!: string;

  @ApiProperty({
    type: [TeamTileItemDto],
    description: 'In work by this person.',
  })
  items!: TeamTileItemDto[];

  @ApiProperty({ description: 'Items this person closed today.' })
  doneToday!: number;
}

export class TeamViewDto {
  @ApiProperty({ type: [TeamTileDto] })
  tiles!: TeamTileDto[];
}

export class TeamAdminParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  adminId!: string;
}

export class TeamReleaseDto {
  @ApiPropertyOptional({
    enum: LEASE_QUEUE_KINDS,
    enumName: 'LeaseQueueKind',
    description: 'Omit kind+itemId to take everything away from this person.',
  })
  @IsOptional()
  @IsIn(LEASE_QUEUE_KINDS)
  kind?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  itemId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class TeamReassignDto {
  @ApiProperty({ enum: LEASE_QUEUE_KINDS, enumName: 'LeaseQueueKind' })
  @IsIn(LEASE_QUEUE_KINDS)
  kind!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  toAdminId!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class TeamReleaseResultDto {
  @ApiProperty({ description: 'How many items went back to the queue.' })
  released!: number;
}
