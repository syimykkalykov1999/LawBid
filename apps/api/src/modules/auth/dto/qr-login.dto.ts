import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { DeviceInfoDto } from './device-info.dto';

/** Base64url of random bytes (the ids and secrets of a QR sign-in). */
const TOKEN = /^[A-Za-z0-9_-]+$/;

/** POST /auth/qr — the website asks for a sign-in QR code. */
export class QrLoginCreateDto {
  @ApiProperty({
    required: false,
    type: DeviceInfoDto,
    description: 'The browser (shown to the phone owner before approving).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}

export class QrLoginCreatedDto {
  @ApiProperty({ description: 'Public id in the QR code (single use).' })
  qrId!: string;

  @ApiProperty({
    description:
      'Secret only this browser knows; sent with every poll. Never shown in the QR code.',
  })
  pollSecret!: string;

  @ApiProperty({
    description: 'The address encoded in the QR code.',
    example: 'https://lawbid.dev/q/AbC…',
  })
  qrUrl!: string;

  @ApiProperty({ type: 'integer', description: 'Seconds until it expires.' })
  expiresIn!: number;
}

/** POST /auth/qr/poll — the website waits for the phone's answer. */
export class QrLoginPollDto {
  @ApiProperty()
  @IsString()
  @Length(16, 64)
  @Matches(TOKEN)
  qrId!: string;

  @ApiProperty()
  @IsString()
  @Length(16, 64)
  @Matches(TOKEN)
  pollSecret!: string;
}

export class QrLoginPollResultDto {
  @ApiProperty({
    enum: ['pending', 'scanned', 'rejected', 'expired', 'approved'],
    description:
      'pending: not scanned; scanned: the phone shows the confirm screen; approved: tokens below (once); rejected / expired: ask for a new code.',
  })
  status!: 'pending' | 'scanned' | 'rejected' | 'expired' | 'approved';

  @ApiProperty({ type: String, nullable: true })
  accessToken!: string | null;

  @ApiProperty({ type: String, nullable: true })
  refreshToken!: string | null;

  @ApiProperty({ type: 'integer', nullable: true })
  accessTokenExpiresIn!: number | null;
}

/** GET /auth/qr/{qrId} — what the phone shows before "Sign in?". */
export class QrLoginPreviewDto {
  @ApiProperty({ type: String, nullable: true })
  deviceName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  platform!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userAgent!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Approximate address of the browser (last part hidden).',
  })
  ipHint!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: 'integer', description: 'Seconds left.' })
  expiresIn!: number;
}

export class QrLoginAnsweredDto {
  @ApiProperty()
  ok!: boolean;
}
