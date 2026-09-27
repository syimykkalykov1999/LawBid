import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { AuthService } from './auth.service';
import { SocialAuthService } from './social/social-auth.service';
import { Public } from './decorators/public.decorator';
import {
  CurrentUser,
  type RequestUser,
} from './decorators/current-user.decorator';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ReauthDto } from './dto/reauth.dto';
import { LinkIdentifierDto } from './dto/link-identifier.dto';
import type { RequestMeta } from './services/session.service';
import { DeviceAttestationGuard } from './attestation/device-attestation.guard';
import { ATTESTATION_HEADER } from './attestation/device-attestation.service';
import {
  AuthTokensDto,
  IdentifierLinkedDto,
  LoggedOutDto,
  OtpSentDto,
  ReauthTokenDto,
  SessionDto,
  SessionEndedDto,
} from './dto/auth-responses.dto';

const E = ErrorCode;
/** Global JwtAuthGuard 401s, for the routes that need a bearer token. */
const BEARER_401 = [E.UNAUTHORIZED, E.TOKEN_EXPIRED, E.AUTH_SESSION_REVOKED];
/** Optional on every route guarded by IdempotencyInterceptor. */
const IdempotencyKeyHeader = ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description:
    'Replays the stored response for a retried request (24h); a different body with the same key is 409 IDEMPOTENCY_KEY_CONFLICT.',
});
/** DeviceAttestationGuard (flag `device_attestation`, docs/01 §10.6). */
const AttestationHeader = ApiHeader({
  name: ATTESTATION_HEADER,
  required: false,
  description:
    'App Attest / Play Integrity token; required only while the device_attestation flag is on.',
});

/**
 * docs/01_FOUNDATION_AUTH.md §10.5. Stays a thin HTTP layer per
 * .cursorrules ("Логика только в service") — every handler just extracts
 * request meta, delegates to AuthService/SocialAuthService, and returns
 * the plain payload (ResponseInterceptor wraps it into {data: ...}).
 *
 * @Public() routes are the ones that ISSUE or EXCHANGE tokens — by
 * definition can't require a bearer token first. Every other route here
 * is protected by the global JwtAuthGuard (AuthModule registers it as
 * APP_GUARD) with no extra decorator needed.
 *
 * IdempotencyInterceptor is applied to the POSTs that create a
 * DB row or cost money to retry (verify/social mint a User+Session,
 * refresh mints a new Session row, identifiers mints a UserIdentifier,
 * otp/request triggers a billed SMS/email send) — logout/logout-all/
 * reauth/DELETE sessions are naturally idempotent already (revoking an
 * already-revoked session is a no-op) so they don't need it.
 *
 * DeviceAttestationGuard (flag `device_attestation`, docs/01 §10.6)
 * guards the two unauthenticated routes that spend money or mint
 * accounts: otp/request and social.
 */
@ApiTags('auth')
@ApiErrors(COMMON_ERRORS)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly socialAuth: SocialAuthService,
  ) {}

  @ApiEnvelopeResponse(OtpSentDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.PHONE_COUNTRY_NOT_SUPPORTED],
    403: [E.DEVICE_ATTESTATION_REQUIRED, E.AUTH_PROVIDER_DISABLED],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
    429: [E.AUTH_OTP_REQUEST_LIMIT, E.RATE_LIMITED],
    503: [E.PROVIDER_BUDGET_EXCEEDED],
  })
  @IdempotencyKeyHeader
  @AttestationHeader
  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DeviceAttestationGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async requestOtp(
    @Body() dto: OtpRequestDto,
    @Req() req: Request,
  ): Promise<OtpSentDto> {
    await this.auth.requestOtp(dto, this.meta(req));
    return { sent: true };
  }

  @ApiEnvelopeResponse(AuthTokensDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [E.AUTH_OTP_INVALID, E.AUTH_OTP_EXPIRED],
    403: [E.AUTH_PROVIDER_DISABLED, E.ACCOUNT_SUSPENDED, E.ACCOUNT_DELETED],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
    423: [E.AUTH_OTP_LOCKED],
    429: [E.RATE_LIMITED],
  })
  @IdempotencyKeyHeader
  @Public()
  @Post('otp/verify')
  @UseInterceptors(IdempotencyInterceptor)
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.auth.verifyOtp(dto, this.meta(req));
  }

  @ApiEnvelopeResponse(AuthTokensDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [E.AUTH_SOCIAL_TOKEN_INVALID],
    403: [
      E.DEVICE_ATTESTATION_REQUIRED,
      E.AUTH_PROVIDER_DISABLED,
      E.ACCOUNT_SUSPENDED,
      E.ACCOUNT_DELETED,
    ],
    409: [E.ACCOUNT_EXISTS_USE_OTHER_METHOD, E.IDEMPOTENCY_KEY_CONFLICT],
    429: [E.RATE_LIMITED],
    503: [E.AUTH_PROVIDER_DISABLED],
  })
  @IdempotencyKeyHeader
  @AttestationHeader
  @Public()
  @Post('social')
  @UseGuards(DeviceAttestationGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async social(
    @Body() dto: SocialLoginDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.socialAuth.login(dto, this.meta(req));
  }

  @ApiEnvelopeResponse(AuthTokensDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [
      E.AUTH_REFRESH_INVALID,
      E.AUTH_REFRESH_EXPIRED,
      E.AUTH_REFRESH_REUSE_DETECTED,
    ],
    403: [E.ACCOUNT_SUSPENDED, E.ACCOUNT_DELETED],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
    429: [E.RATE_LIMITED],
  })
  @IdempotencyKeyHeader
  @Public()
  @Post('refresh')
  @UseInterceptors(IdempotencyInterceptor)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.auth.refresh(dto, this.meta(req));
  }

  @ApiBearerAuth()
  @ApiEnvelopeResponse(LoggedOutDto)
  @ApiErrors({ 401: BEARER_401 })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: RequestUser): Promise<LoggedOutDto> {
    await this.auth.logout(user);
    return { loggedOut: true };
  }

  @ApiBearerAuth()
  @ApiEnvelopeResponse(LoggedOutDto)
  @ApiErrors({ 401: BEARER_401 })
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: RequestUser): Promise<LoggedOutDto> {
    await this.auth.logoutAll(user);
    return { loggedOut: true };
  }

  @ApiBearerAuth()
  @ApiEnvelopeResponse(SessionDto, { isArray: true })
  @ApiErrors({ 401: BEARER_401 })
  @Get('sessions')
  async listSessions(@CurrentUser() user: RequestUser): Promise<SessionDto[]> {
    return this.auth.listSessions(user);
  }

  @ApiBearerAuth()
  @ApiEnvelopeResponse(SessionEndedDto)
  @ApiErrors({ 401: BEARER_401, 404: [E.NOT_FOUND] })
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async endSession(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<SessionEndedDto> {
    await this.auth.endSession(user, id);
    return { ended: true };
  }

  @ApiBearerAuth()
  @ApiEnvelopeResponse(ReauthTokenDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [...BEARER_401, E.REAUTH_INVALID],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
  })
  @IdempotencyKeyHeader
  @Post('reauth')
  @UseInterceptors(IdempotencyInterceptor)
  async reauth(
    @Body() dto: ReauthDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ReauthTokenDto> {
    return this.auth.reauth(dto, user);
  }

  @ApiBearerAuth()
  @ApiEnvelopeResponse(IdentifierLinkedDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [...BEARER_401, E.AUTH_OTP_INVALID, E.AUTH_SOCIAL_TOKEN_INVALID],
    403: [E.AUTH_PROVIDER_DISABLED],
    409: [E.IDENTIFIER_ALREADY_LINKED, E.IDEMPOTENCY_KEY_CONFLICT],
    503: [E.AUTH_PROVIDER_DISABLED],
  })
  @IdempotencyKeyHeader
  @Post('identifiers')
  @UseInterceptors(IdempotencyInterceptor)
  async linkIdentifier(
    @Body() dto: LinkIdentifierDto,
    @CurrentUser() user: RequestUser,
  ): Promise<IdentifierLinkedDto> {
    await this.auth.linkIdentifier(dto, user);
    return { linked: true };
  }

  private meta(req: Request): RequestMeta {
    const deviceId = req.header('x-device-id')?.trim();
    return {
      ip: req.ip,
      userAgent: req.header('user-agent'),
      deviceId: deviceId && deviceId.length <= 255 ? deviceId : undefined,
    };
  }
}
