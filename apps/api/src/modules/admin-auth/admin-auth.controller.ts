import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  AuditAction,
  CurrentAdmin,
  type AdminActor,
} from './admin-auth.decorators';
import {
  AdminLoginStartDto,
  AdminLoginVerifyDto,
  AdminLoginVerifyResultDto,
  AdminLogoutResultDto,
  AdminMeDto,
  AdminRecoveryDto,
  AdminSessionDto,
  AdminTotpDto,
} from './admin-auth.dto';
import { AdminAuthService } from './admin-auth.service';

const E = ErrorCode;
const START_ERRORS = {
  ...COMMON_ERRORS,
  400: [E.VALIDATION_ERROR],
  429: [E.RATE_LIMITED, E.AUTH_OTP_REQUEST_LIMIT],
  503: [E.ADMIN_AUTH_NOT_CONFIGURED, E.PROVIDER_BUDGET_EXCEEDED],
};
const SECOND_FACTOR_ERRORS = {
  ...COMMON_ERRORS,
  400: [E.VALIDATION_ERROR],
  401: [
    E.ADMIN_TICKET_INVALID,
    E.ADMIN_TOTP_INVALID,
    E.ADMIN_RECOVERY_CODE_INVALID,
  ],
  503: [E.ADMIN_AUTH_NOT_CONFIGURED],
};

/** docs/06 §2.1 admin sign-in (email code → TOTP), session, me. */
@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @Post('login/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send the sign-in code to an admin email' })
  @ApiErrors(START_ERRORS)
  async adminLoginStart(
    @Body() dto: AdminLoginStartDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.auth.loginStart(dto.email, ip || null);
  }

  @Public()
  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Check the email code; returns the 2FA ticket (and enrollment on first sign-in)',
  })
  @ApiEnvelopeResponse(AdminLoginVerifyResultDto)
  @ApiErrors({
    ...START_ERRORS,
    401: [E.AUTH_OTP_INVALID, E.AUTH_OTP_EXPIRED, E.AUTH_OTP_LOCKED],
  })
  adminLoginVerify(
    @Body() dto: AdminLoginVerifyDto,
  ): Promise<AdminLoginVerifyResultDto> {
    return this.auth.loginVerify(dto.email, dto.code);
  }

  @Public()
  @Post('totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticator code → admin session (8 h)' })
  @ApiEnvelopeResponse(AdminSessionDto)
  @ApiErrors(SECOND_FACTOR_ERRORS)
  adminTotp(
    @Body() dto: AdminTotpDto,
    @Ip() ip: string,
  ): Promise<AdminSessionDto> {
    return this.auth.totpVerify(dto.ticket, dto.code, ip || null);
  }

  @Public()
  @Post('recovery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recovery code instead of the authenticator' })
  @ApiEnvelopeResponse(AdminSessionDto)
  @ApiErrors(SECOND_FACTOR_ERRORS)
  adminRecovery(
    @Body() dto: AdminRecoveryDto,
    @Ip() ip: string,
  ): Promise<AdminSessionDto> {
    return this.auth.recovery(dto.ticket, dto.recoveryCode, ip || null);
  }

  @AdminEndpoint(...ALL_ADMIN_ROLES)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @AuditAction('logout')
  @ApiOperation({ summary: 'End this admin session' })
  @ApiEnvelopeResponse(AdminLogoutResultDto)
  async adminLogout(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<AdminLogoutResultDto> {
    await this.auth.logout(admin);
    return { ok: true };
  }

  @AdminEndpoint(...ALL_ADMIN_ROLES)
  @Get('me')
  @ApiOperation({ summary: 'The signed-in admin' })
  @ApiEnvelopeResponse(AdminMeDto)
  adminMe(@CurrentAdmin() admin: AdminActor): Promise<AdminMeDto> {
    return this.auth.me(admin);
  }
}
