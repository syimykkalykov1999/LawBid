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
  AdminUsersQueryDto,
  SanctionResultDto,
  SuspendUserDto,
  WarnUserDto,
  ChangeUserPhoneDto,
  PhoneChangedDto,
  type AdminUsersPage,
} from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';

const E = ErrorCode;
const TARGET_ERRORS = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN],
  404: [E.NOT_FOUND],
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
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Search users (name, email, phone, @username, id)',
  })
  @ApiEnvelopeResponse(AdminUserListItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  searchUsers(@Query() query: AdminUsersQueryDto): Promise<AdminUsersPage> {
    return this.users.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'User card (no contacts)' })
  @ApiEnvelopeResponse(AdminUserCardDto)
  @ApiErrors(TARGET_ERRORS)
  getUserCard(@Param() params: AdminUserIdParamDto): Promise<AdminUserCardDto> {
    return this.users.card(params.id);
  }

  @Get(':id/contacts')
  @Justification()
  @ApiOperation({
    summary: 'Email / phone — requires X-Justification (audited)',
  })
  @ApiEnvelopeResponse(AdminUserContactsDto)
  @ApiErrors(TARGET_ERRORS)
  getUserContacts(
    @Param() params: AdminUserIdParamDto,
  ): Promise<AdminUserContactsDto> {
    return this.users.contacts(params.id);
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
    ...TARGET_ERRORS,
    409: [E.IDENTIFIER_ALREADY_LINKED],
    429: [E.RATE_LIMITED],
  })
  changeUserPhone(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminUserIdParamDto,
    @Body() dto: ChangeUserPhoneDto,
  ): Promise<PhoneChangedDto> {
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
