import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** POST /conversations/:id/calls — owner 2026-10-05: video or audio. */
export class StartCallDto {
  @ApiPropertyOptional({
    default: false,
    description: 'A video call (needs the `video_calls` flag).',
  })
  @IsOptional()
  @IsBoolean()
  video?: boolean;
}

/** GET /calls/video — may the app offer video calls right now. */
export class VideoCallConfigDto {
  @ApiProperty()
  available!: boolean;

  @ApiProperty({ enum: ['webrtc'] })
  provider!: 'webrtc';

  @ApiPropertyOptional({
    enum: ['flag_off', 'provider_not_configured'],
    enumName: 'VideoCallUnavailableReason',
    nullable: true,
    description: 'Why not (null when available).',
  })
  reason!: 'flag_off' | 'provider_not_configured' | null;
}

export class CallIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class EndCallDto {
  @ApiPropertyOptional({
    enum: ['hangup', 'no_answer', 'failed'],
    enumName: 'CallEndReason',
    description:
      'hangup (default); no_answer = the caller gave up ringing; failed = the connection could not be set up.',
  })
  @IsOptional()
  @IsIn(['hangup', 'no_answer', 'failed'])
  reason?: 'hangup' | 'no_answer' | 'failed';
}

/** POST /groups/:id/calls — start a call from a group chat. */
export class StartGroupCallDto {
  @ApiPropertyOptional({ description: 'Video call (default: audio).' })
  @IsOptional()
  @IsBoolean()
  video?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Group members to ring (up to the size of the call minus the host); the rest of the group can join from the chat.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  userIds?: string[];
}

export class GroupCallParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

/** POST /calls/:id/participants — add a person to the running call. */
export class InviteCallDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional({ description: 'Username, with or without @.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;
}

export class CallParticipantParamDto extends CallIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

/** POST /calls/:id/participants/:userId/mute (host) and /mute-state (self). */
export class CallMuteDto {
  @ApiProperty()
  @IsBoolean()
  muted!: boolean;
}

/** The other member of the call as the viewer sees them. */
export class CallPeerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: ['attorney', 'client'] })
  kind!: 'attorney' | 'client';
}

/** One person in a group call. */
export class CallParticipantDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({
    enum: ['invited', 'joined', 'declined', 'left', 'removed'],
    enumName: 'CallParticipantStatus',
  })
  status!: 'invited' | 'joined' | 'declined' | 'left' | 'removed';

  @ApiProperty({
    description: 'The microphone is off (their own or the host).',
  })
  muted!: boolean;

  @ApiProperty({ description: 'The host switched the microphone off.' })
  mutedByHost!: boolean;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'When they joined; the later joiner offers WebRTC.',
  })
  joinedAt!: Date | null;
}

/** OQ-041: an in-app audio call. */
export class CallDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Null for a call started from a group chat.',
  })
  conversationId!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'The group chat the call was started from (else null).',
  })
  groupId!: string | null;

  @ApiProperty({ format: 'uuid' })
  callerId!: string;

  @ApiProperty({ format: 'uuid' })
  calleeId!: string;

  @ApiProperty({
    enum: [
      'ringing',
      'active',
      'ended',
      'missed',
      'declined',
      'busy',
      'canceled',
      'failed',
    ],
    enumName: 'CallStatus',
  })
  status!:
    | 'ringing'
    | 'active'
    | 'ended'
    | 'missed'
    | 'declined'
    | 'busy'
    | 'canceled'
    | 'failed';

  @ApiProperty({ description: 'The viewer placed the call.' })
  outgoing!: boolean;

  /** Owner 2026-10-05: cameras on (false = audio only). */
  @ApiProperty({ default: false })
  video!: boolean;

  @ApiProperty({ type: CallPeerDto })
  peer!: CallPeerDto;

  /** Owner 2026-10-20: people were added; `participants` lists everyone. */
  @ApiProperty({ default: false })
  group!: boolean;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Who can mute / remove others (group calls).',
  })
  hostId!: string | null;

  @ApiProperty({ type: CallParticipantDto, isArray: true })
  participants!: CallParticipantDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  answeredAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  endedAt!: Date | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  durationSec!: number | null;
}

export class IceServerDto {
  @ApiProperty({ type: String, isArray: true })
  urls!: string[];

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  credential!: string | null;
}

/** STUN + short-lived TURN credentials for WebRTC (OQ-041). */
export class IceServersDto {
  @ApiProperty({ type: IceServerDto, isArray: true })
  iceServers!: IceServerDto[];

  @ApiProperty({
    type: 'integer',
    description: 'Seconds the TURN login lives.',
  })
  ttlSec!: number;
}
