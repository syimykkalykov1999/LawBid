import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** docs/06 §2.1 admin sign-in: email → email code → TOTP (or recovery). */

export class AdminLoginStartDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

/** Login + password: the first factor next to the emailed code. */
export class AdminPasswordLoginDto {
  @ApiProperty({ example: 'your.login', maxLength: 40 })
  @IsString()
  @MaxLength(40)
  login!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class AdminRecoverQuestionDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  login!: string;
}

export class AdminRecoverQuestionResultDto {
  @ApiProperty({
    description:
      'The super admin’s own security question (a neutral text for any other login).',
  })
  question!: string;
}

export class AdminRecoverPasswordDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  login!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  answer!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MaxLength(128)
  newPassword!: string;
}

export class AdminChangeOwnCredentialsDto {
  @ApiPropertyOptional({
    description: 'Required when a password is already set.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  newLogin?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  newPassword?: string;
}

export class AdminSecurityQuestionDto {
  @ApiProperty({ minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  question!: string;

  @ApiProperty({ minLength: 4, maxLength: 200 })
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  answer!: string;
}

export class AdminOkDto {
  @ApiProperty() ok!: boolean;
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

  @ApiProperty({ type: String, nullable: true, description: 'Login, if set.' })
  login!: string | null;

  @ApiProperty({ description: 'A password is set.' })
  hasPassword!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
    description:
      'Area toggles (empty for the super admin, who reaches everything).',
  })
  permissions!: Record<string, 'view' | 'manage'>;

  @ApiProperty({ description: 'Super admin: a security question is set.' })
  hasSecurityQuestion!: boolean;

  @ApiProperty({ type: String, nullable: true })
  securityQuestion!: string | null;
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

/** Owner 2026-10-01: a fresh authenticator code before key changes. */
export class AdminStepUpDto {
  @ApiProperty({ description: 'The 6-digit authenticator code.' })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class AdminStepUpResultDto {
  @ApiProperty() validForSeconds!: number;
}
