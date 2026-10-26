import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Owner 2026-10-28: «add to calendar» links riding on existing DTOs. */
export class CalendarLinksDto {
  @ApiProperty({
    description: 'Opens a pre-filled new event in Google Calendar.',
  })
  google!: string;

  @ApiProperty({ description: 'Opens a pre-filled new event in Outlook.' })
  outlook!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'A signed link to a one-event .ics file (Apple Calendar and others).',
  })
  ics!: string | null;
}

export class CalendarFeedStatusDto {
  @ApiProperty({ description: 'The feed is switched on for everyone.' })
  enabled!: boolean;

  @ApiProperty({ description: 'The person has an active secret link.' })
  hasLink!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  createdAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastUsedAt!: string | null;
}

export class CalendarFeedLinkDto {
  @ApiProperty({
    description:
      'https link of the .ics feed. Shown ONCE: only a hash is kept. Anyone with the link sees the calendar; create a new link to revoke the old.',
  })
  url!: string;

  @ApiProperty({
    description: 'The same link with webcal:// (one tap in Apple Calendar).',
  })
  webcalUrl!: string;

  @ApiProperty()
  createdAt!: string;
}

export class CalendarProviderParamDto {
  @ApiProperty({ enum: ['google', 'microsoft'] })
  @IsIn(['google', 'microsoft'])
  provider!: 'google' | 'microsoft';
}

export class CalendarConnectionDto {
  @ApiProperty({ enum: ['google', 'microsoft'] })
  provider!: 'google' | 'microsoft';

  @ApiPropertyOptional({ type: String, nullable: true })
  accountEmail!: string | null;

  @ApiProperty({ enum: ['active', 'needs_reauth'] })
  status!: 'active' | 'needs_reauth';

  @ApiProperty({ description: 'Their busy time blocks booking.' })
  readBusy!: boolean;

  @ApiProperty({
    description: 'Consultations are written into their calendar.',
  })
  writeEvents!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastSyncAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastError!: string | null;
}

export class CalendarProvidersDto {
  @ApiProperty({ description: 'Google link is switched on by the admin.' })
  googleEnabled!: boolean;

  @ApiProperty({ description: 'Outlook link is switched on by the admin.' })
  microsoftEnabled!: boolean;

  @ApiProperty({ type: CalendarConnectionDto, isArray: true })
  connections!: CalendarConnectionDto[];
}

export class CalendarConnectStartDto {
  @ApiProperty({ description: 'Open this vendor sign-in page in the browser.' })
  url!: string;
}

export class UpdateCalendarConnectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readBusy?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  writeEvents?: boolean;
}

export class OAuthCallbackQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  error?: string;
}

export class IcsLinkQueryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  d!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  sig!: string;
}

// --- no-shows ----------------------------------------------------------------

export const NO_SHOW_STATES = [
  'open',
  'disputed',
  'confirmed',
  'withdrawn',
  'overturned',
  'unconfirmed',
] as const;

export class NoShowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: ['attorney', 'client'],
    description: 'Who did not come.',
  })
  absentSide!: 'attorney' | 'client';

  @ApiProperty({
    enum: NO_SHOW_STATES,
    description:
      'open: the marked person may dispute until disputeUntil; disputed: waits for staff; confirmed: final, counts for reliability; unconfirmed: the system suggested it and nobody confirmed; withdrawn / overturned: does not count.',
  })
  state!: (typeof NO_SHOW_STATES)[number];

  @ApiProperty({ enum: ['attorney', 'client', 'auto'] })
  source!: 'attorney' | 'client' | 'auto';

  @ApiProperty()
  markedAt!: string;

  @ApiProperty()
  disputeUntil!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  disputeReason!: string | null;

  @ApiProperty({ description: 'The viewer is the person marked absent.' })
  viewerIsAbsent!: boolean;

  @ApiProperty()
  canDispute!: boolean;

  @ApiProperty()
  canWithdraw!: boolean;
}

export class NoShowInfoDto {
  @ApiProperty({ type: NoShowDto, isArray: true })
  noShows!: NoShowDto[];

  @ApiProperty({
    description:
      'The viewer may mark the other side as absent now (switch on, confirmed, after the grace window, before the marking window ends).',
  })
  canMarkNoShow!: boolean;
}

export class ConsultationNoShowParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class DisputeNoShowDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminNoShowsQueryDto {
  @ApiPropertyOptional({ enum: NO_SHOW_STATES, default: 'disputed' })
  @IsOptional()
  @IsIn(NO_SHOW_STATES)
  state?: (typeof NO_SHOW_STATES)[number];
}

export class AdminNoShowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) consultationId!: string;
  @ApiProperty({ enum: ['attorney', 'client'] }) absentSide!:
    'attorney' | 'client';
  @ApiProperty({ format: 'uuid' }) absentUserId!: string;
  @ApiProperty({ enum: ['attorney', 'client', 'auto'] }) source!:
    'attorney' | 'client' | 'auto';
  @ApiPropertyOptional({ type: String, nullable: true }) markedById!:
    string | null;
  @ApiProperty({ enum: NO_SHOW_STATES })
  state!: (typeof NO_SHOW_STATES)[number];
  @ApiProperty() markedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) disputeReason!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolutionNote!:
    string | null;
}

export class ResolveNoShowDto {
  @ApiProperty({
    enum: ['uphold', 'overturn'],
    description:
      'uphold: the mark stands and counts; overturn: it does not count.',
  })
  @IsIn(['uphold', 'overturn'])
  decision!: 'uphold' | 'overturn';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}
