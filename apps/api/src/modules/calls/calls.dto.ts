import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

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

/** OQ-041: an in-app audio call. */
export class CallDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

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

  @ApiProperty({ type: CallPeerDto })
  peer!: CallPeerDto;

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
