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
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
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
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly socialAuth: SocialAuthService,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async requestOtp(@Body() dto: OtpRequestDto, @Req() req: Request) {
    await this.auth.requestOtp(dto, this.meta(req));
    return { sent: true };
  }

  @Public()
  @Post('otp/verify')
  @UseInterceptors(IdempotencyInterceptor)
  async verifyOtp(@Body() dto: OtpVerifyDto, @Req() req: Request) {
    return this.auth.verifyOtp(dto, this.meta(req));
  }

  @Public()
  @Post('social')
  @UseInterceptors(IdempotencyInterceptor)
  async social(@Body() dto: SocialLoginDto, @Req() req: Request) {
    return this.socialAuth.login(dto, this.meta(req));
  }

  @Public()
  @Post('refresh')
  @UseInterceptors(IdempotencyInterceptor)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(dto, this.meta(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: RequestUser) {
    await this.auth.logout(user);
    return { loggedOut: true };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: RequestUser) {
    await this.auth.logoutAll(user);
    return { loggedOut: true };
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: RequestUser) {
    return this.auth.listSessions(user);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async endSession(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.auth.endSession(user, id);
    return { ended: true };
  }

  @Post('reauth')
  @UseInterceptors(IdempotencyInterceptor)
  async reauth(@Body() dto: ReauthDto, @CurrentUser() user: RequestUser) {
    return this.auth.reauth(dto, user);
  }

  @Post('identifiers')
  @UseInterceptors(IdempotencyInterceptor)
  async linkIdentifier(
    @Body() dto: LinkIdentifierDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.auth.linkIdentifier(dto, user);
    return { linked: true };
  }

  private meta(req: Request): RequestMeta {
    return { ip: req.ip, userAgent: req.header('user-agent') };
  }
}
