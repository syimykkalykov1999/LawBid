import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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

  @ApiProperty({ enum: ['webrtc', 'livekit', 'cloudflare'] })
  provider!: 'webrtc' | 'livekit' | 'cloudflare';

  @ApiPropertyOptional({
    enum: ['flag_off', 'provider_not_configured'],
    enumName: 'VideoCallUnavailableReason',
    nullable: true,
    description: 'Why not (null when available).',
  })
  reason!: 'flag_off' | 'provider_not_configured' | null;
}

/** POST /calls/:id/votes — propose to remove a member. */
export class StartCallVoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  targetId!: string;
}

/** POST /calls/:id/votes/:voteId — a ballot. */
export class CastCallVoteDto {
  @ApiProperty({ description: 'true = for removing, false = against.' })
  @IsBoolean()
  favor!: boolean;
}

export class CallVoteParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  voteId!: string;
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

  @ApiPropertyOptional({
    description:
      'Group call, host only: end the call for everyone (like Telegram "End call for everyone"). Without it a host who hangs up just leaves, the call goes on for the others.',
  })
  @IsOptional()
  @IsBoolean()
  forAll?: boolean;
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
  @ArrayMaxSize(8)
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

  @ApiPropertyOptional({
    description:
      'Cloudflare SFU calls only: this person publishes at least one track, so pull them (POST /calls/:id/sfu/subscribe).',
  })
  sfuReady?: boolean;

  @ApiPropertyOptional({
    type: [String],
    enum: ['mic', 'cam'],
    description:
      'Cloudflare SFU calls only: the tracks this person publishes now.',
  })
  sfuTracks?: Array<'mic' | 'cam'>;
}

/** Owner 2026-10-24: the outage fallback of a group call, for the app. */
export class CallMediaFallbackDto {
  @ApiProperty({
    description:
      'true: Cloudflare was chosen but this call runs device to device because it was down or unconfigured at its start.',
  })
  active!: boolean;

  @ApiProperty({ enum: ['sfu_unavailable'], nullable: true })
  reason!: 'sfu_unavailable' | null;

  @ApiProperty({
    description:
      'true: more people are in the call than the threshold (calls.sfu_fallback_mesh_max, 4), so the camera cannot be switched on. When the person taps video/camera, show «На сервере идут работы. Видео можно будет включить примерно через час.» instead.',
  })
  videoBlocked!: boolean;

  @ApiProperty({ description: 'The threshold (default 4).' })
  videoMaxParticipants!: number;
}

/** OQ-041: an in-app audio call. */
/** The open vote to remove a member from a group call (owner 2026-10-21). */
export class CallVoteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  targetId!: string;

  @ApiProperty({ format: 'uuid' })
  startedById!: string;

  @ApiProperty({ type: 'integer' })
  forCount!: number;

  @ApiProperty({ type: 'integer' })
  againstCount!: number;

  @ApiProperty({
    type: 'integer',
    description: 'How many members vote (in the call, minus the candidate).',
  })
  voters!: number;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: "The viewer's ballot (null = not voted).",
  })
  myBallot!: boolean | null;
}

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

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Owner 2026-10-21 (inbox 20e): the channel the call belongs to (else null).',
  })
  channelId?: string | null;

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
    enum: ['p2p', 'cloudflare'],
    description:
      'Owner 2026-10-24: how the media of this call is carried, fixed at its start. cloudflare = Cloudflare SFU (use POST /calls/:id/sfu/*); p2p = device to device (1:1 calls and the fallback).',
  })
  mediaProvider?: 'p2p' | 'cloudflare';

  @ApiPropertyOptional({
    type: CallMediaFallbackDto,
    description:
      'Owner 2026-10-24: set on group calls only; see CallMediaFallbackDto. Also sent with every call:participants event.',
  })
  mediaFallback?: CallMediaFallbackDto;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Who can mute / remove others (group calls).',
  })
  hostId!: string | null;

  @ApiProperty({ type: CallParticipantDto, isArray: true })
  participants!: CallParticipantDto[];

  @ApiProperty({
    default: false,
    description:
      'Somebody who runs the call (the starter or a group admin) is in it: members cannot vote to remove anyone then.',
  })
  moderated!: boolean;

  @ApiPropertyOptional({ type: CallVoteDto, nullable: true })
  vote!: CallVoteDto | null;

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

/** GET /calls/ice-servers?relayFailed=true — owner 2026-10-26 (failover). */
export class IceServersQueryDto {
  @ApiPropertyOptional({
    description:
      'The relay of my running call died (ICE failed): a fresh login, our own TURN first, and a report for the Cloudflare health breaker.',
  })
  @IsOptional()
  // T1 (audit 2026-10-26): only true / false; anything else stays as sent
  // and is refused (400) instead of silently reading as false.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  relayFailed?: boolean;
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

/** POST /calls/:id/livekit-token — what the app hands to the LiveKit SDK. */
export class LiveKitJoinDto {
  @ApiProperty({ description: 'wss:// address of the LiveKit server.' })
  url!: string;

  @ApiProperty({ description: 'Access token (JWT); identity = your user id.' })
  token!: string;

  @ApiProperty({ description: 'Room name = the call id.' })
  room!: string;

  @ApiProperty()
  identity!: string;

  @ApiProperty({ enum: ['host', 'speaker', 'listener'] })
  role!: 'host' | 'speaker' | 'listener';

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
