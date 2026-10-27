import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Justification,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminUserCardDto,
  AdminUserContactsDto,
  AdminUserIdParamDto,
  AdminUserListItemDto,
  AdminUsersBulkDto,
  AdminUsersBulkPreviewDto,
  AdminUsersBulkPreviewResultDto,
  AdminUsersQueryDto,
  SanctionResultDto,
  SuspendUserDto,
  WarnUserDto,
  ChangeUserPhoneDto,
  PhoneChangedDto,
  type AdminUsersPage,
} from './admin-users.dto';
import { AdminBulkResultDto } from '../admin-content/admin-content.dto';
import { AdminUsersService } from './admin-users.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';

const E = ErrorCode;
const TARGET_ERRORS = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN],
  404: [E.NOT_FOUND],
};
/** Account-takeover paths also need a fresh step-up (owner 2026-10-22). */
const STEP_UP_TARGET_ERRORS = {
  ...TARGET_ERRORS,
  403: [E.FORBIDDEN, E.ADMIN_STEP_UP_REQUIRED],
};

/**
 * docs/06 §2.3 item 3, §2.2 matrix: viewing — super_admin, moderator,
 * support; revoke sessions — the same three; warn / suspend / restore —
 * super_admin and moderator. Sanctions write their own audit rows.
 */
@ApiTags('admin-users')
@AdminEndpoint('super_admin', 'moderator', 'support')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly auth: AdminAuthService,
  ) {}

  // Audit 2026-10-02: finance reads user basics for subscriptions
  // (contacts stay restricted to the class roles).
  @Get()
  @Roles('super_admin', 'moderator', 'support', 'finance')
  @ApiOperation({
    summary: 'Search users (name, email, phone, @username, id)',
  })
  @ApiEnvelopeResponse(AdminUserListItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  searchUsers(
    @CurrentAdmin() admin: AdminActor,
    @Query() query: AdminUsersQueryDto,
  ): Promise<AdminUsersPage> {
    return this.users.search(query, admin.countries);
  }

  // Audit 2026-10-02: read-only for finance (subscriptions) and verifiers
  // (the verification card links here).
  @Get(':id')
  @Roles('super_admin', 'moderator', 'support', 'finance', 'verifier')
  @ApiOperation({ summary: 'User card (no contacts)' })
  @ApiEnvelopeResponse(AdminUserCardDto)
  @ApiErrors(TARGET_ERRORS)
  getUserCard(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
  ): Promise<AdminUserCardDto> {
    return this.users.card(params.id, admin.countries);
  }

  @Get(':id/contacts')
  @Justification()
  @ApiOperation({
    summary: 'Email / phone — requires X-Justification (audited)',
  })
  @ApiEnvelopeResponse(AdminUserContactsDto)
  @ApiErrors(TARGET_ERRORS)
  getUserContacts(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
  ): Promise<AdminUserContactsDto> {
    return this.users.contacts(params.id, admin.countries);
  }

  @Post('bulk/preview')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'moderator')
  @ApiOperation({
    summary:
      'S18-10: how many users a bulk filter matches (read-only, before the action)',
  })
  @ApiEnvelopeResponse(AdminUsersBulkPreviewResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  bulkPreview(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminUsersBulkPreviewDto,
  ): Promise<AdminUsersBulkPreviewResultDto> {
    return this.users.bulkPreview(dto.filter, admin.countries);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'moderator')
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Owner 2026-10-04: suspend, restore or end sessions of up to 500 users; one reason, audited per user',
  })
  @ApiEnvelopeResponse(AdminBulkResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.ADMIN_STEP_UP_REQUIRED],
  })
  async bulk(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminUsersBulkDto,
  ): Promise<AdminBulkResultDto> {
    // System audit #2, item 2: up to 500 accounts at once — step-up.
    await this.auth.assertStepUp(admin.sessionId);
    return this.users.bulk(admin, dto);
  }

  @Post(':id/sessions/revoke')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Revoke every session of the user' })
  @ApiEnvelopeResponse(SanctionResultDto)
  @ApiErrors(TARGET_ERRORS)
  revokeUserSessions(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
  ): Promise<SanctionResultDto> {
    return this.users.revokeSessions(admin, params.id);
  }

  @Post(':id/password/reset')
  @HttpCode(HttpStatus.OK)
  // An account takeover path (the next SMS code signs in): super admins
  // and moderators, like warn / suspend.
  @Roles('super_admin', 'moderator')
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      "Reset the user's password (sessions signed out; SMS code to sign in once)",
  })
  @ApiEnvelopeResponse(SanctionResultDto)
  @ApiErrors(STEP_UP_TARGET_ERRORS)
  async resetUserPassword(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
  ): Promise<SanctionResultDto> {
    // Owner 2026-10-22: an account takeover path — step-up.
    await this.auth.assertStepUp(admin.sessionId);
    return this.users.resetPassword(admin, params.id);
  }

  @Post(':id/phone')
  @HttpCode(HttpStatus.OK)
  // Security audit 2026-10-01: an account takeover path — super admins only.
  @Roles('super_admin')
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      "Change the phone on the user's request (sessions signed out, user notified)",
  })
  @ApiEnvelopeResponse(PhoneChangedDto)
  @ApiErrors({
    ...STEP_UP_TARGET_ERRORS,
    409: [E.IDENTIFIER_ALREADY_LINKED],
    429: [E.RATE_LIMITED],
  })
  async changeUserPhone(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
    @Body() dto: ChangeUserPhoneDto,
  ): Promise<PhoneChangedDto> {
    // System audit #2, item 2: the phone signs in — step-up.
    await this.auth.assertStepUp(admin.sessionId);
    return this.users.changePhone(admin, params.id, dto.phone, dto.reason);
  }

  @Post(':id/warn')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'moderator')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Warn (moderation_notice)' })
  @ApiEnvelopeResponse(SanctionResultDto)
  @ApiErrors(TARGET_ERRORS)
  warnUser(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
    @Body() dto: WarnUserDto,
  ): Promise<SanctionResultDto> {
    return this.users.warn(admin, params.id, dto.reason);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'moderator')
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Suspend (§3.4): sessions revoked; client open cases archived; attorney profile suspended',
  })
  @ApiEnvelopeResponse(SanctionResultDto)
  @ApiErrors({ ...TARGET_ERRORS, 409: [E.ACCOUNT_SUSPENDED] })
  suspendUser(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
    @Body() dto: SuspendUserDto,
  ): Promise<SanctionResultDto> {
    return this.users.suspend(admin, params.id, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'moderator')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Restore a suspended account' })
  @ApiEnvelopeResponse(SanctionResultDto)
  @ApiErrors({ ...TARGET_ERRORS, 409: [E.VALIDATION_ERROR] })
  restoreUser(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
  ): Promise<SanctionResultDto> {
    return this.users.restore(admin, params.id);
  }
}
