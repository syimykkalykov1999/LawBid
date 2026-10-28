import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const SDP_MAX = 64 * 1024;

export class SfuIceServerDto {
  @ApiProperty({ type: [String] })
  urls!: string[];
}

/** POST /calls/:id/sfu/session */
export class SfuSessionDto {
  @ApiProperty({
    description:
      'Our handle for your Cloudflare session. Informational: every later call finds your session from your login, never from this value.',
  })
  sessionId!: string;

  @ApiProperty({
    type: [SfuIceServerDto],
    description:
      'STUN for the SFU. For hard networks also use GET /calls/ice-servers (TURN).',
  })
  iceServers!: SfuIceServerDto[];
}

export class SfuPublishTrackDto {
  @ApiProperty({ description: 'Transceiver mid in your offer.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,16}$/)
  mid!: string;

  @ApiProperty({ enum: ['mic', 'cam'] })
  @IsIn(['mic', 'cam'])
  trackName!: 'mic' | 'cam';
}

/** POST /calls/:id/sfu/publish */
export class SfuPublishDto {
  @ApiProperty({ description: 'Your SDP offer (sendonly transceivers).' })
  @IsString()
  @MaxLength(SDP_MAX)
  sdp!: string;

  @ApiProperty({ type: [SfuPublishTrackDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => SfuPublishTrackDto)
  tracks!: SfuPublishTrackDto[];
}

export class SfuPublishedTrackDto {
  @ApiProperty()
  mid!: string;

  @ApiProperty({ enum: ['mic', 'cam'] })
  trackName!: 'mic' | 'cam';
}

export class SfuPublishFailedDto {
  @ApiProperty()
  trackName!: string;

  @ApiProperty()
  errorCode!: string;
}

export class SfuPublishResultDto {
  @ApiProperty({ enum: ['answer'] })
  type!: 'answer';

  @ApiProperty({ description: 'Apply with setRemoteDescription.' })
  sdp!: string;

  @ApiProperty({ type: [SfuPublishedTrackDto] })
  tracks!: SfuPublishedTrackDto[];

  @ApiProperty({ type: [SfuPublishFailedDto] })
  failed!: SfuPublishFailedDto[];
}

/** POST /calls/:id/sfu/subscribe */
export class SfuSubscribeDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'People to receive; empty = everybody in the call.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({ type: [String], enum: ['mic', 'cam'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(['mic', 'cam'], { each: true })
  trackNames?: Array<'mic' | 'cam'>;

  @ApiPropertyOptional({
    enum: ['f', 'h', 'q'],
    description: 'Simulcast layer of the video: full, half, quarter.',
  })
  @IsOptional()
  @IsIn(['f', 'h', 'q'])
  rid?: 'f' | 'h' | 'q';
}

export class SfuSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: ['mic', 'cam'] })
  trackName!: 'mic' | 'cam';

  @ApiProperty({ description: 'Your transceiver mid for this stream.' })
  mid!: string;
}

export class SfuSkippedDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ description: 'mic, cam or * for all of that person.' })
  trackName!: string;

  @ApiProperty({
    description:
      'not_in_call | not_published | already_pulled | batch_limit | a Cloudflare error code.',
  })
  reason!: string;
}

export class SfuSubscribeResultDto {
  @ApiProperty({
    description:
      'true: apply `sdp` as the remote offer, answer it with POST /calls/:id/sfu/answer.',
  })
  requiresAnswer!: boolean;

  @ApiProperty({ enum: ['offer'], nullable: true })
  type!: 'offer' | null;

  @ApiProperty({ type: String, nullable: true })
  sdp!: string | null;

  @ApiProperty({ type: [SfuSubscriptionDto] })
  subscriptions!: SfuSubscriptionDto[];

  @ApiProperty({
    type: [SfuSkippedDto],
    description:
      '`batch_limit` entries: ask again after the answer has been sent.',
  })
  skipped!: SfuSkippedDto[];
}

/** POST /calls/:id/sfu/answer */
export class SfuAnswerDto {
  @ApiProperty({ description: 'Your SDP answer to the SFU offer.' })
  @IsString()
  @MaxLength(SDP_MAX)
  sdp!: string;
}

export class SfuOkDto {
  @ApiProperty()
  ok!: boolean;
}

/** POST /calls/:id/sfu/failed — owner 2026-10-26 (failover, LC-5). */
export class SfuFailedResultDto {
  @ApiProperty({
    description:
      'The call moved to our own path (now, or before this report came)',
  })
  moved!: boolean;

  @ApiProperty({
    description: 'Members of this call that reported in the last minute',
  })
  reports!: number;
}

/** POST /calls/:id/sfu/close */
export class SfuCloseDto {
  @ApiPropertyOptional({
    type: [String],
    enum: ['mic', 'cam'],
    description: 'Stop publishing these of your own tracks.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(['mic', 'cam'], { each: true })
  trackNames?: Array<'mic' | 'cam'>;

  @ApiPropertyOptional({
    type: [String],
    description: 'Stop receiving these people (a person who left).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    description:
      'Your SDP offer after you stopped the transceivers of `userIds`; the answer comes back. Without it the tracks are force-closed.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SDP_MAX)
  sdp?: string;
}

export class SfuCloseResultDto {
  @ApiProperty({ type: [String], description: 'The mids that were closed.' })
  closed!: string[];

  @ApiProperty({ enum: ['answer'], nullable: true })
  type!: 'answer' | null;

  @ApiProperty({ type: String, nullable: true })
  sdp!: string | null;
}

/** POST /calls/:id/sfu/layer */
export class SfuLayerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;

  @ApiProperty({ enum: ['f', 'h', 'q'] })
  @IsIn(['f', 'h', 'q'])
  rid!: 'f' | 'h' | 'q';
}
