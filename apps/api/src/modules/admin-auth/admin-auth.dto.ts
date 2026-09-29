import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

/** docs/06 §2.1 admin sign-in: email → email code → TOTP (or recovery). */

export class AdminLoginStartDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class AdminLoginVerifyDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ description: 'The 6-digit code from the email.' })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class AdminTotpDto {
  @ApiProperty({ description: 'Ticket from login/verify (5 minutes).' })
  @IsString()
  @Length(20, 2000)
  ticket!: string;

  @ApiProperty({ description: 'The 6-digit authenticator code.' })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class AdminRecoveryDto {
  @ApiProperty({ description: 'Ticket from login/verify (5 minutes).' })
  @IsString()
  @Length(20, 2000)
  ticket!: string;

  @ApiProperty({ description: 'One of the recovery codes (XXXXX-XXXXX).' })
  @IsString()
  @Length(10, 16)
  recoveryCode!: string;
}

export class TotpEnrollmentDto {
  @ApiProperty({ description: 'Base32 secret (manual entry).' })
  secret!: string;

  @ApiProperty({ description: 'otpauth:// URI for the QR code.' })
  otpauthUri!: string;
}

export class AdminLoginVerifyResultDto {
  @ApiProperty({
    description:
      'Short-lived proof that the email code was accepted; exchange it with the TOTP code (or a recovery code).',
  })
  ticket!: string;

  @ApiPropertyOptional({
    type: TotpEnrollmentDto,
    nullable: true,
    description:
      'Present on the first sign-in (or after a 2FA reset): bind the authenticator app, then send its code to /totp.',
  })
  totpEnrollment!: TotpEnrollmentDto | null;
}

export class AdminMeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({
    enum: ['super_admin', 'moderator', 'verifier', 'support', 'finance'],
  })
  role!: string;

  @ApiProperty()
  totpEnabled!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: string | null;
}

export class AdminSessionDto {
  @ApiProperty({ description: 'Admin JWT (Bearer), aud = lawbid-admin.' })
  accessToken!: string;

  @ApiProperty({
    format: 'date-time',
    description:
      'Absolute expiry (8 h); the session also ends after 30 min idle.',
  })
  expiresAt!: string;

  @ApiProperty({ type: AdminMeDto })
  admin!: AdminMeDto;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Only right after the authenticator was bound: ten one-time recovery codes, shown once.',
  })
  recoveryCodes?: string[];
}

export class AdminLogoutResultDto {
  @ApiProperty()
  ok!: true;
}
