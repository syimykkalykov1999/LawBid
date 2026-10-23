import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** docs/06 §2.1 admin sign-in (owner 2026-10-22): login + password, then
 * the authenticator code — mandatory for every admin. */

/** Login + password: the first factor (always followed by the code). */
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

export class AdminTotpDto {
  @ApiProperty({ description: 'Ticket from login/password (5 minutes).' })
  @IsString()
  @Length(20, 2000)
  ticket!: string;

  @ApiProperty({ description: 'The 6-digit authenticator code.' })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class AdminRecoveryDto {
  @ApiProperty({ description: 'Ticket from login/password (5 minutes).' })
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
    type: String,
    nullable: true,
    description:
      'The ticket for step 2: the authenticator code (or a recovery code) at /totp — or, when totpSetupRequired, the forced setup at /login/totp-setup.',
  })
  ticket!: string | null;

  @ApiProperty({
    type: () => AdminSessionDto,
    nullable: true,
    description:
      'Always null since owner 2026-10-22: the password alone never signs in.',
  })
  session!: AdminSessionDto | null;

  @ApiProperty({
    description:
      'This admin has no authenticator yet: set it up now (QR + recovery codes) before anything else.',
  })
  totpSetupRequired!: boolean;

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-22: this admin has a passkey — step 2 may be /login/passkey/options + /login/passkey instead of the code.',
  })
  passkeyAvailable?: boolean;
}

// ---- Owner 2026-10-22: passkeys (WebAuthn) ------------------------------

export class AdminPasskeyOptionsDto {
  @ApiProperty({ description: 'Ticket from login/password (5 minutes).' })
  @IsString()
  @Length(20, 2000)
  ticket!: string;
}

export class AdminPasskeyLoginDto {
  @ApiProperty({ description: 'Ticket from login/password (5 minutes).' })
  @IsString()
  @Length(20, 2000)
  ticket!: string;

  @ApiProperty({ description: 'challengeId from /login/passkey/options.' })
  @IsString()
  @Length(16, 64)
  challengeId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'AuthenticationResponseJSON from the authenticator.',
  })
  @IsObject()
  response!: Record<string, unknown>;
}

export class AdminPasskeyStepUpDto {
  @ApiProperty({ description: 'challengeId from /step-up/passkey/options.' })
  @IsString()
  @Length(16, 64)
  challengeId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'AuthenticationResponseJSON from the authenticator.',
  })
  @IsObject()
  response!: Record<string, unknown>;
}

export class AdminPasskeyRegisterDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'RegistrationResponseJSON from the authenticator.',
  })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

/** Forced first setup of the authenticator, step A. */
export class AdminTotpSetupBeginDto {
  @ApiProperty({ description: 'Ticket from login/password (15 minutes).' })
  @IsString()
  @Length(20, 2000)
  ticket!: string;
}

/** Forced first setup, step B: the first code from the app. */
export class AdminTotpSetupFinishDto {
  @ApiProperty({ description: 'Ticket from login/password (15 minutes).' })
  @IsString()
  @Length(20, 2000)
  ticket!: string;

  @ApiProperty({ description: 'The 6-digit code the app shows now.' })
  @Matches(/^\d{6}$/)
  code!: string;
}

/** Owner 2026-10-05: one country tab of the admin panel. */
export class AdminCountryTabDto {
  @ApiProperty({ example: 'CA' }) code!: string;
  @ApiProperty({ example: 'Canada' }) name!: string;
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

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Owner 2026-10-22: passkeys enrolled for the admin sign-in.',
  })
  passkeyCount?: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Login, if set.' })
  login!: string | null;

  @ApiProperty({ description: 'A password is set.' })
  hasPassword!: boolean;

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-22: the admin may get system alerts (owner, or holds the «Дежурный» right).',
  })
  onCallAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'Owner 2026-10-22: the admin’s own switch for those alerts.',
  })
  onCallEnabled?: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
    description:
      'Area toggles (empty for the super admin, who reaches everything).',
  })
  permissions!: Record<string, 'view' | 'manage'>;

  @ApiProperty({ description: 'Super admin: a security question is set.' })
  hasSecurityQuestion!: boolean;

  @ApiProperty({
    description:
      'May create and manage other admins (the super admin always can).',
  })
  canManageAdmins!: boolean;

  @ApiProperty({
    description:
      'Owner 2026-10-16: «без персональных данных» — people’s phones, emails and names are masked for this admin.',
  })
  noPii!: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Owner 2026-10-06: the country partner whose team this admin is in (null = LawBid staff).',
  })
  countryPartnerId!: string | null;

  @ApiProperty({
    description:
      'This admin is the country partner themself (hires their team).',
  })
  partnerLead!: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Owner 2026-10-05: countries this admin works with (ISO 3166-1 alpha-2); empty = every country.',
  })
  countries!: string[];

  @ApiProperty({
    type: [AdminCountryTabDto],
    description:
      'Country tabs for the panel: the assigned countries, or every switched-on country for staff working everywhere.',
  })
  countryTabs!: AdminCountryTabDto[];

  @ApiProperty({ type: String, nullable: true })
  securityQuestion!: string | null;

  @ApiProperty({
    type: [String],
    description:
      'Sections where this admin must write a reason (always empty for the super admin).',
  })
  reasonRequiredAreas!: string[];
}

export class AdminOnCallDto {
  @ApiProperty({ description: 'Get push + e-mail when the system breaks.' })
  @IsBoolean()
  enabled!: boolean;
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
}

export class AdminLogoutResultDto {
  @ApiProperty()
  ok!: true;
}

/** Owner 2026-10-01 / 2026-10-22: a fresh authenticator code before a
 * sensitive action (the authenticator is mandatory, no password fallback). */
export class AdminStepUpDto {
  @ApiProperty({ description: 'The 6-digit authenticator code.' })
  @Matches(/^\d{6}$/)
  code!: string;
}

/** The forced setup is done: recovery codes (shown once) and the session. */
export class AdminTotpSetupResultDto {
  @ApiProperty({
    type: [String],
    description: 'Ten one-time recovery codes, shown once.',
  })
  recoveryCodes!: string[];

  @ApiProperty({ type: () => AdminSessionDto })
  session!: AdminSessionDto;
}

export class AdminStepUpResultDto {
  @ApiProperty() validForSeconds!: number;
}

// ---- Owner 2026-10-16: invite link for a new administrator -------------

export class AdminInvitePreviewDto {
  @ApiProperty({ format: 'email', description: 'The address the link is for.' })
  email!: string;
}

export class AdminInviteAcceptDto {
  @ApiProperty({ minLength: 20, maxLength: 128 })
  @IsString()
  @Length(20, 128)
  token!: string;

  @ApiProperty({ example: 'your.login', maxLength: 40 })
  @IsString()
  @MaxLength(40)
  login!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class AdminInviteAcceptResultDto {
  @ApiProperty({ description: 'The login to sign in with.' })
  login!: string;
}
