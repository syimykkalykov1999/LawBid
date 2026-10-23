import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppCheckGuard } from '../app-check/app-check.guard';
import { AssistantSelf } from '../assistant/assistant-context';
import { AuthService } from '../auth.service';
import {
  CurrentUser,
  type RequestUser,
} from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { AuthTokensDto, ReauthTokenDto } from '../dto/auth-responses.dto';
import {
  AUTH_EVENT_TYPES,
  AuthEventService,
} from '../services/auth-event.service';
import { ReauthVerifier } from '../services/reauth-verifier.service';
import type { RequestMeta } from '../services/session.service';
import { TokenService } from '../services/token.service';
import { WebSessionCookieInterceptor } from '../web-session-cookie';
import {
  PasskeyAssertDto,
  PasskeyAuthenticationOptionsDto,
  PasskeyDto,
  PasskeyListDto,
  PasskeyLoginDto,
  PasskeyLoginOptionsDto,
  PasskeyRegisterDto,
  PasskeyRegistrationOptionsDto,
  PasskeyRemovedDto,
} from './passkey.dto';
import { PasskeyService } from './passkey.service';

const E = ErrorCode;
/** Optional: a recent sign-in is enough; otherwise the single-use token
 * from POST /auth/reauth (or /auth/passkeys/reauth) lets the call through. */
const ReauthTokenHeader = ApiHeader({
  name: 'X-Reauth-Token',
  required: false,
  description:
    'Single-use reauthToken (5 min). Needed only when the sign-in is not recent.',
});
const BEARER_401 = [E.UNAUTHORIZED, E.TOKEN_EXPIRED, E.AUTH_SESSION_REVOKED];
const PASSKEY_LOGIN_PER_IP_PER_HOUR = 120;
const PASSKEY_REAUTH_PER_USER_PER_HOUR = 60;

/**
 * Owner 2026-10-22 (systems checklist §1): passkeys for the app.
 *   - enrol / list / remove under the signed-in account (enrolling and
 *     removing need a recent sign-in or a reauth token, like changing the
 *     e-mail);
 *   - sign in with a passkey (public; discoverable credential, the
 *     authenticator picks the account) — SMS / e-mail codes keep working;
 *   - reauth with a passkey: a single-use X-Reauth-Token for sensitive
 *     actions instead of an OTP.
 * The client flow is in docs/runbooks/PASSKEYS.md.
 */
@ApiTags('auth')
@ApiErrors(COMMON_ERRORS)
@AssistantSelf()
@Controller('auth/passkeys')
@UseInterceptors(WebSessionCookieInterceptor)
@UseGuards(AppCheckGuard)
export class PasskeyController {
  constructor(
    private readonly passkeys: PasskeyService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly reauthVerifier: ReauthVerifier,
    private readonly authEvents: AuthEventService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- enrolment --------------------------------------------------------

  @ApiBearerAuth()
  @ReauthTokenHeader
  @Post('register/options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Options to create a passkey for this account' })
  @ApiEnvelopeResponse(PasskeyRegistrationOptionsDto)
  @ApiErrors({
    401: BEARER_401,
    403: [E.REAUTH_REQUIRED],
    409: [E.PASSKEY_LIMIT],
  })
  async passkeyRegisterOptions(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<PasskeyRegistrationOptionsDto> {
    await this.reauthVerifier.assertRecentAuthentication(req);
    const account = await this.account(user.sub);
    const options = await this.passkeys.registrationOptions(
      user.sub,
      'user',
      account,
    );
    return { options: options as unknown as Record<string, unknown> };
  }

  @ApiBearerAuth()
  @ReauthTokenHeader
  @Post('register')
  @ApiOperation({ summary: 'Store the passkey the authenticator created' })
  @ApiEnvelopeResponse(PasskeyDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [...BEARER_401, E.PASSKEY_INVALID],
  })
  async passkeyRegister(
    @CurrentUser() user: RequestUser,
    @Body() dto: PasskeyRegisterDto,
    @Ip() ip: string,
  ): Promise<PasskeyDto> {
    const view = await this.passkeys.verifyRegistration(
      user.sub,
      'user',
      dto.response as unknown as RegistrationResponseJSON,
      dto.name,
    );
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.PASSKEY_ADDED,
      success: true,
      ip,
      meta: { passkeyId: view.id },
    });
    return view;
  }

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'The passkeys of this account' })
  @ApiEnvelopeResponse(PasskeyListDto)
  @ApiErrors({ 401: BEARER_401 })
  async passkeyList(@CurrentUser() user: RequestUser): Promise<PasskeyListDto> {
    return { passkeys: await this.passkeys.list(user.sub, 'user') };
  }

  @ApiBearerAuth()
  @ReauthTokenHeader
  @Delete(':id')
  @ApiOperation({
    summary: 'Remove a passkey (recent sign-in or reauth token)',
  })
  @ApiEnvelopeResponse(PasskeyRemovedDto)
  @ApiErrors({
    401: BEARER_401,
    403: [E.REAUTH_REQUIRED],
    404: [E.PASSKEY_NOT_FOUND],
  })
  async passkeyRemove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<PasskeyRemovedDto> {
    await this.reauthVerifier.assertRecentAuthentication(req);
    await this.passkeys.remove(user.sub, 'user', id);
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.PASSKEY_REMOVED,
      success: true,
      ip,
      meta: { passkeyId: id },
    });
    return { removed: true };
  }

  // ---- sign-in ----------------------------------------------------------

  @Public()
  @Post('login/options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Options to sign in with a passkey (no identifier: the authenticator offers the saved accounts)',
  })
  @ApiEnvelopeResponse(PasskeyAuthenticationOptionsDto)
  @ApiErrors({ 403: [E.AUTH_PROVIDER_DISABLED], 429: [E.RATE_LIMITED] })
  async passkeyLoginOptions(
    @Body() dto: PasskeyLoginOptionsDto,
    @Ip() ip: string,
  ): Promise<PasskeyAuthenticationOptionsDto> {
    await this.auth.assertPasskeyLoginAllowed(dto.deviceInfo?.platform);
    await this.passkeys.limit(
      ['passkey-login', 'ip', ip],
      PASSKEY_LOGIN_PER_IP_PER_HOUR,
    );
    return this.passkeys.authenticationOptions('user', null);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Sign in with the passkey assertion' })
  @ApiEnvelopeResponse(AuthTokensDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [E.PASSKEY_INVALID],
    403: [E.AUTH_PROVIDER_DISABLED, E.ACCOUNT_SUSPENDED, E.ACCOUNT_DELETED],
    429: [E.RATE_LIMITED],
  })
  async passkeyLogin(
    @Body() dto: PasskeyLoginDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthTokensDto> {
    await this.auth.assertPasskeyLoginAllowed(dto.deviceInfo?.platform);
    await this.passkeys.limit(
      ['passkey-login', 'ip', ip],
      PASSKEY_LOGIN_PER_IP_PER_HOUR,
    );
    const meta = this.meta(req);
    let proof;
    try {
      proof = await this.passkeys.verifyAuthentication(
        'user',
        dto.challengeId,
        dto.response as unknown as AuthenticationResponseJSON,
      );
    } catch (err) {
      await this.authEvents.record({
        eventType: AUTH_EVENT_TYPES.PASSKEY_LOGIN_FAILED,
        success: false,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw err;
    }
    return this.auth.issuePasskeyLogin(
      proof.userId,
      proof.credentialId,
      dto.deviceInfo ?? {},
      meta,
    );
  }

  // ---- reauth (step-up) -------------------------------------------------

  @ApiBearerAuth()
  @Post('reauth/options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Options to confirm a sensitive action with a passkey',
  })
  @ApiEnvelopeResponse(PasskeyAuthenticationOptionsDto)
  @ApiErrors({
    401: BEARER_401,
    404: [E.PASSKEY_NOT_FOUND],
    429: [E.RATE_LIMITED],
  })
  async passkeyReauthOptions(
    @CurrentUser() user: RequestUser,
  ): Promise<PasskeyAuthenticationOptionsDto> {
    await this.passkeys.limit(
      ['passkey-reauth', 'user', user.sub],
      PASSKEY_REAUTH_PER_USER_PER_HOUR,
    );
    return this.passkeys.authenticationOptions('user', user.sub, user.sid);
  }

  @ApiBearerAuth()
  @Post('reauth')
  @ApiOperation({
    summary:
      'A single-use X-Reauth-Token from the passkey assertion (instead of an OTP)',
  })
  @ApiEnvelopeResponse(ReauthTokenDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [...BEARER_401, E.PASSKEY_INVALID],
  })
  async passkeyReauth(
    @CurrentUser() user: RequestUser,
    @Body() dto: PasskeyAssertDto,
    @Ip() ip: string,
  ): Promise<ReauthTokenDto> {
    try {
      await this.passkeys.verifyAuthentication(
        'user',
        dto.challengeId,
        dto.response as unknown as AuthenticationResponseJSON,
        { userId: user.sub, bind: user.sid },
      );
    } catch (err) {
      await this.authEvents.record({
        userId: user.sub,
        eventType: AUTH_EVENT_TYPES.REAUTH_FAILED,
        success: false,
        ip,
        meta: { method: 'passkey' },
      });
      throw err;
    }
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.REAUTH_SUCCESS,
      success: true,
      ip,
      meta: { method: 'passkey' },
    });
    return {
      reauthToken: this.tokens.signReauthToken({
        sub: user.sub,
        sid: user.sid,
      }),
    };
  }

  // ---- helpers ----------------------------------------------------------

  private async account(
    userId: string,
  ): Promise<{ userName: string; displayName: string }> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        phone_e164: true,
        first_name: true,
        last_name: true,
      },
    });
    const displayName = [u.first_name, u.last_name].filter(Boolean).join(' ');
    return {
      userName: u.email ?? u.phone_e164 ?? 'LawBid',
      displayName: displayName || (u.email ?? u.phone_e164 ?? 'LawBid'),
    };
  }

  private meta(req: Request): RequestMeta {
    const deviceId = req.header('x-device-id')?.trim();
    const deviceKey = req.header('x-device-key')?.trim();
    return {
      ip: req.ip,
      userAgent: req.header('user-agent'),
      deviceId: deviceId && deviceId.length <= 255 ? deviceId : undefined,
      deviceKey:
        deviceKey && deviceKey.length >= 8 && deviceKey.length <= 128
          ? deviceKey
          : undefined,
    };
  }
}
