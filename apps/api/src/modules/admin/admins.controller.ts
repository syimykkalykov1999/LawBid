import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Delete,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminAccountDto,
  AdminIdParamDto,
  CreateAdminDto,
  SetAdminCredentialsDto,
  SetAdminPermissionsDto,
  SetAdminRoleDto,
} from './admin.dto';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AdminsService } from './admins.service';

const E = ErrorCode;
const TARGET_ERRORS = { 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] };

/** docs/06 §2.3 item 13. The super admin, or an admin the super admin gave
 * the manage-admins right (AdminAuthGuard keeps everyone else out); the
 * service then limits a manager to what they hold themselves. The service
 * writes before/after audit rows itself. */
@ApiTags('admin-admins')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin/admins')
export class AdminsController {
  constructor(
    private readonly admins: AdminsService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'All administrator accounts' })
  @ApiEnvelopeResponse(AdminAccountDto, { isArray: true })
  listAdmins(@CurrentAdmin() actor: AdminActor): Promise<AdminAccountDto[]> {
    return this.admins.list(actor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an administrator (no self-registration)' })
  @ApiEnvelopeResponse(AdminAccountDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 409: [E.ADMIN_EMAIL_TAKEN] })
  createAdmin(
    @CurrentAdmin() actor: AdminActor,
    @Body() dto: CreateAdminDto,
  ): Promise<AdminAccountDto> {
    return this.admins.create(
      actor,
      dto.email,
      dto.role,
      dto.permissions,
      dto.canManageAdmins,
    );
  }

  @Patch(':id/role')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Assign a role (ends the admin’s sessions)' })
  @ApiEnvelopeResponse(AdminAccountDto)
  @ApiErrors(TARGET_ERRORS)
  setAdminRole(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
    @Body() dto: SetAdminRoleDto,
  ): Promise<AdminAccountDto> {
    return this.admins.setRole(actor, params.id, dto.role);
  }

  @Patch(':id/permissions')
  @ApiOperation({
    summary:
      'Toggle areas for an admin (view / manage), within what the caller holds. Money and keys cannot be granted.',
  })
  @ApiEnvelopeResponse(AdminAccountDto)
  @ApiErrors(TARGET_ERRORS)
  setAdminPermissions(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
    @Body() dto: SetAdminPermissionsDto,
  ): Promise<AdminAccountDto> {
    return this.admins.setPermissions(
      actor,
      params.id,
      dto.permissions,
      dto.canManageAdmins,
    );
  }

  @Put(':id/credentials')
  @ApiOperation({
    summary:
      'Set an admin’s login and/or password (needs a fresh step-up; their sessions end)',
  })
  @ApiEnvelopeResponse(AdminAccountDto)
  @ApiErrors({
    ...TARGET_ERRORS,
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.ADMIN_LOGIN_TAKEN],
  })
  async setAdminCredentials(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
    @Body() dto: SetAdminCredentialsDto,
  ): Promise<AdminAccountDto> {
    await this.admins.assertCanManage(actor, params.id);
    await this.auth.assertStepUp(actor.sessionId);
    await this.auth.setCredentialsFor(actor, params.id, {
      login: dto.login,
      password: dto.password,
    });
    return this.admins.get(params.id);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable an administrator (sessions revoked)' })
  @ApiEnvelopeResponse(AdminAccountDto)
  @ApiErrors(TARGET_ERRORS)
  disableAdmin(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
  ): Promise<AdminAccountDto> {
    return this.admins.setEnabled(actor, params.id, false);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-enable a disabled administrator' })
  @ApiEnvelopeResponse(AdminAccountDto)
  @ApiErrors(TARGET_ERRORS)
  enableAdmin(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
  ): Promise<AdminAccountDto> {
    return this.admins.setEnabled(actor, params.id, true);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Remove an administrator: account closed, login and password wiped, sessions revoked',
  })
  @ApiErrors(TARGET_ERRORS)
  async removeAdmin(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
  ): Promise<void> {
    await this.admins.remove(actor, params.id);
  }

  @Post(':id/reset-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset 2FA: the next sign-in binds a new authenticator',
  })
  @ApiEnvelopeResponse(AdminAccountDto)
  @ApiErrors(TARGET_ERRORS)
  resetAdminTotp(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
  ): Promise<AdminAccountDto> {
    return this.admins.resetTotp(actor, params.id);
  }
}
