import { ApiProperty } from '@nestjs/swagger';

/**
 * Response payloads of /auth/* (docs/01_FOUNDATION_AUTH.md §10.5) for the
 * OpenAPI contract (docs/01 §6.3). They mirror what AuthController /
 * AuthService actually return — the services keep returning plain objects
 * of the same shape; these classes only document it (the `data` of the
 * §7 envelope, see ApiEnvelopeResponse).
 */

/** otp/verify, social, refresh (AuthTokensResult). */
export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT access token (Bearer).' })
  accessToken!: string;

  @ApiProperty({
    description: 'Opaque rotating refresh token; store in secure storage only.',
  })
  refreshToken!: string;

  @ApiProperty({
    type: 'integer',
    description: 'Access token lifetime in seconds.',
  })
  accessTokenExpiresIn!: number;

  @ApiProperty({ description: 'True when this call created the account.' })
  isNewUser!: boolean;
}

/** One active session chain (GET /auth/sessions, SessionListItem). */
export class SessionDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Session chain id (stable across refresh rotations) — the id DELETE /auth/sessions/{id} takes.',
  })
  sessionId!: string;

  @ApiProperty({ type: String, nullable: true })
  deviceId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  deviceName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  platform!: string | null;

  @ApiProperty({ type: String, nullable: true })
  appVersion!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ description: 'True for the session making this request.' })
  isCurrent!: boolean;
}

export class ReauthTokenDto {
  @ApiProperty({
    description:
      'Single-use token for the X-Reauth-Token header of a sensitive action; expires after REAUTH_TOKEN_TTL_SECONDS (5 min).',
  })
  reauthToken!: string;
}

/** POST /auth/otp/request. */
export class OtpSentDto {
  @ApiProperty({ description: 'Always true: the code was sent.' })
  sent!: boolean;
}

/** POST /auth/logout and /auth/logout-all. */
export class LoggedOutDto {
  @ApiProperty({ description: 'Always true.' })
  loggedOut!: boolean;
}

/** DELETE /auth/sessions/{id}. */
export class SessionEndedDto {
  @ApiProperty({ description: 'Always true.' })
  ended!: boolean;
}

/** POST /auth/identifiers. */
export class IdentifierLinkedDto {
  @ApiProperty({ description: 'Always true.' })
  linked!: boolean;
}
