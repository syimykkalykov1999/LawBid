import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
  SkipAutoAudit,
  CurrentAdmin,
  type AdminActor,
} from './admin-auth.decorators';
import {
  AdminChangeOwnCredentialsDto,
  AdminInviteAcceptDto,
  AdminInviteAcceptResultDto,
  AdminInvitePreviewDto,
  AdminOkDto,
  AdminPasswordLoginDto,
  AdminRecoverPasswordDto,
  AdminRecoverQuestionDto,
  AdminRecoverQuestionResultDto,
  AdminSecurityQuestionDto,
  AdminLoginVerifyResultDto,
  AdminLogoutResultDto,
  AdminMeDto,
  AdminRecoveryDto,
  AdminSessionDto,
  AdminTotpDto,
  AdminTotpSetupBeginDto,
  AdminTotpSetupFinishDto,
  AdminTotpSetupResultDto,
  AdminStepUpDto,
  AdminStepUpResultDto,
  TotpEnrollmentDto,
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

/** docs/06 §2.1 admin sign-in (owner 2026-10-22: login + password → the
 * authenticator code, mandatory; the first time → its forced setup),
 * session, me, step-up. */
@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @Post('login/totp-setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Forced first setup, step A: a secret / QR for the authenticator app (password ticket)',
  })
  @ApiEnvelopeResponse(TotpEnrollmentDto)
  @ApiErrors(SECOND_FACTOR_ERRORS)
  adminTotpSetupBegin(
    @Body() dto: AdminTotpSetupBeginDto,
  ): Promise<TotpEnrollmentDto> {
    return this.auth.totpSetupBegin(dto.ticket);
  }

  @Public()
  @Post('login/totp-confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Forced first setup, step B: the first code switches the authenticator on → recovery codes (once) + session',
  })
  @ApiEnvelopeResponse(AdminTotpSetupResultDto)
  @ApiErrors(SECOND_FACTOR_ERRORS)
  adminTotpSetupFinish(
    @Body() dto: AdminTotpSetupFinishDto,
    @Ip() ip: string,
    @Req() req: Request,
  ): Promise<AdminTotpSetupResultDto> {
    return this.auth.totpSetupFinish(
      dto.ticket,
      dto.code,
      ip || null,
      req.headers['user-agent'] ?? null,
    );
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
    @Req() req: Request,
  ): Promise<AdminSessionDto> {
    return this.auth.totpVerify(
      dto.ticket,
      dto.code,
      ip || null,
      req.headers['user-agent'] ?? null,
    );
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
    @Req() req: Request,
  ): Promise<AdminSessionDto> {
    return this.auth.recovery(
      dto.ticket,
      dto.recoveryCode,
      ip || null,
      req.headers['user-agent'] ?? null,
    );
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
  @Post('step-up')
  @HttpCode(200)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Confirm with a fresh authenticator code for 5 minutes before a sensitive change (every try is audited)',
  })
  @ApiEnvelopeResponse(AdminStepUpResultDto)
  @ApiErrors({ 403: [E.ADMIN_TOTP_INVALID, E.ADMIN_TOTP_SETUP_REQUIRED] })
  stepUp(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminStepUpDto,
  ): Promise<AdminStepUpResultDto> {
    return this.auth.stepUp(admin.id, admin.sessionId, dto.code, admin.ip);
  }

  @AdminEndpoint(...ALL_ADMIN_ROLES)
  @Get('me')
  @ApiOperation({ summary: 'The signed-in admin' })
  @ApiEnvelopeResponse(AdminMeDto)
  adminMe(@CurrentAdmin() admin: AdminActor): Promise<AdminMeDto> {
    return this.auth.me(admin);
  }

  @Public()
  @Get('invite/:token')
  @ApiOperation({
    summary:
      'Who an invite link is for (404 when it is unknown, used or older than 72 hours)',
  })
  @ApiEnvelopeResponse(AdminInvitePreviewDto)
  @ApiErrors({ ...START_ERRORS, 404: [E.NOT_FOUND] })
  adminInvitePreview(
    @Param('token') token: string,
    @Ip() ip: string,
  ): Promise<AdminInvitePreviewDto> {
    return this.auth.previewInvite(token, ip || null);
  }

  @Public()
  @Post('invite/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'The invited admin chooses a login and password; the link is spent. The first sign-in then sets up the authenticator (mandatory).',
  })
  @ApiEnvelopeResponse(AdminInviteAcceptResultDto)
  @ApiErrors({
    ...START_ERRORS,
    404: [E.NOT_FOUND],
    409: [E.ADMIN_LOGIN_TAKEN],
  })
  adminInviteAccept(
    @Body() dto: AdminInviteAcceptDto,
    @Ip() ip: string,
  ): Promise<AdminInviteAcceptResultDto> {
    return this.auth.acceptInvite(
      dto.token,
      { login: dto.login, password: dto.password },
      ip || null,
    );
  }

  @Public()
  @Post('login/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login + password → a ticket for step 2: the authenticator code, or (totpSetupRequired) its forced first setup. Never a session on its own.',
  })
  @ApiEnvelopeResponse(AdminLoginVerifyResultDto)
  @ApiErrors({
    ...START_ERRORS,
    401: [E.ADMIN_CREDENTIALS_INVALID],
  })
  adminLoginPassword(
    @Body() dto: AdminPasswordLoginDto,
    @Ip() ip: string,
  ): Promise<AdminLoginVerifyResultDto> {
    return this.auth.loginPassword(dto.login, dto.password, ip || null);
  }

  @Public()
  @Post('recover/question')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Show the super admin security question' })
  @ApiEnvelopeResponse(AdminRecoverQuestionResultDto)
  @ApiErrors(START_ERRORS)
  async adminRecoverQuestion(
    @Body() dto: AdminRecoverQuestionDto,
    @Ip() ip: string,
  ): Promise<AdminRecoverQuestionResultDto> {
    return { question: await this.auth.recoverQuestion(dto.login, ip || null) };
  }

  @Public()
  @Post('recover/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Super admin forgot the password: answer the question, set a new one (sessions end)',
  })
  @ApiEnvelopeResponse(AdminOkDto)
  @ApiErrors({ ...START_ERRORS, 401: [E.ADMIN_RECOVERY_FAILED] })
  async adminRecoverPassword(
    @Body() dto: AdminRecoverPasswordDto,
    @Ip() ip: string,
  ): Promise<AdminOkDto> {
    await this.auth.recoverPassword(
      dto.login,
      dto.answer,
      dto.newPassword,
      ip || null,
    );
    return { ok: true };
  }

  @AdminEndpoint('super_admin')
  @Put('me/credentials')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Change my own login and/or password' })
  @ApiEnvelopeResponse(AdminOkDto)
  @ApiErrors({
    ...START_ERRORS,
    403: [E.ADMIN_CREDENTIALS_INVALID],
    409: [E.ADMIN_LOGIN_TAKEN],
  })
  async adminChangeOwnCredentials(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminChangeOwnCredentialsDto,
  ): Promise<AdminOkDto> {
    await this.auth.changeOwnCredentials(admin, dto);
    return { ok: true };
  }

  @AdminEndpoint('super_admin')
  @Put('me/security-question')
  @SkipAutoAudit()
  @ApiOperation({
    summary: 'Super admin: set the recovery question and answer',
  })
  @ApiEnvelopeResponse(AdminOkDto)
  async adminSetSecurityQuestion(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminSecurityQuestionDto,
  ): Promise<AdminOkDto> {
    await this.auth.setSecurityQuestion(admin, dto.question, dto.answer);
    return { ok: true };
  }
}
