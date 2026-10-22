import {
  BadRequestException,
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
import { ADMIN_PRESETS, findPreset } from '../admin-auth/admin-permissions';
import {
  AdminAccountDto,
  AdminIdParamDto,
  AdminInviteResultDto,
  AdminPresetDto,
  InviteAdminDto,
  CreateAdminDto,
  SetAdminCountriesDto,
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
      dto.noPii,
    );
  }

  @Get('presets')
  @ApiOperation({
    summary:
      'Ready-made rights (owner, accountant, moderator, support, view-only) to start from',
  })
  @ApiEnvelopeResponse(AdminPresetDto, { isArray: true })
  listPresets(): AdminPresetDto[] {
    return ADMIN_PRESETS.map((p) => ({
      key: p.key,
      label: p.label,
      description: p.description,
      role: p.role,
      permissions: { ...p.permissions },
      noPii: p.noPii,
      dangerous: p.dangerous === true,
    }));
  }

  @Post('invites')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Invite an administrator: creates the account with a preset’s rights and returns a one-time link (72 h) for the owner to send himself — no email is sent. Needs a fresh step-up.',
  })
  @ApiEnvelopeResponse(AdminInviteResultDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.ADMIN_EMAIL_TAKEN],
  })
  async inviteAdmin(
    @CurrentAdmin() actor: AdminActor,
    @Body() dto: InviteAdminDto,
  ): Promise<AdminInviteResultDto> {
    const preset = dto.preset ? findPreset(dto.preset) : undefined;
    if (dto.preset && !preset) {
      throw new BadRequestException({
        code: E.VALIDATION_ERROR,
        message: 'Unknown preset.',
      });
    }
    const role = dto.role ?? preset?.role;
    if (!role) {
      throw new BadRequestException({
        code: E.VALIDATION_ERROR,
        message: 'Choose a preset or a role.',
      });
    }
    await this.auth.assertStepUp(actor.sessionId);
    const admin = await this.admins.create(
      actor,
      dto.email,
      role,
      dto.permissions ?? (preset ? preset.permissions : undefined),
      undefined,
      dto.noPii ?? preset?.noPii,
    );
    const invite = await this.auth.createInvite(actor, admin.id);
    return { admin, invite };
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'A new one-time sign-up link (72 h) for an existing administrator; the old link stops working. Needs a fresh step-up.',
  })
  @ApiEnvelopeResponse(AdminInviteResultDto)
  @ApiErrors({ ...TARGET_ERRORS, 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async reinviteAdmin(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
  ): Promise<AdminInviteResultDto> {
    await this.admins.assertCanManage(actor, params.id);
    await this.auth.assertStepUp(actor.sessionId);
    const invite = await this.auth.createInvite(actor, params.id);
    return { admin: await this.admins.get(params.id), invite };
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
      'Toggle areas for an admin (view / manage), within what the caller holds. Keys, admin management and sessions cannot be granted; money, economy, budget limits and the audit log only by the super admin.',
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
      dto.noPii,
    );
  }

  @Put(':id/countries')
  @ApiOperation({
    summary:
      'Countries an employee works with (owner 2026-10-05): their lists, queues and workspace show only people, cases and tickets of these countries. Empty = every country.',
  })
  @ApiEnvelopeResponse(AdminAccountDto)
  @ApiErrors(TARGET_ERRORS)
  setAdminCountries(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
    @Body() dto: SetAdminCountriesDto,
  ): Promise<AdminAccountDto> {
    return this.admins.setCountries(actor, params.id, dto.countries);
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

  /**
   * Owner 2026-10-22: only the super admin resets another admin's
   * authenticator (a lost phone), after a fresh step-up; audited, the
   * admin's sessions end and the next sign-in forces a new setup. Never
   * one's own (that is the console: `npm run admin:set-credentials`).
   */
  @Post(':id/reset-2fa')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Super admin: reset another admin’s authenticator (needs a fresh step-up); the next sign-in sets up a new one',
  })
  @ApiEnvelopeResponse(AdminAccountDto)
  @ApiErrors({ ...TARGET_ERRORS, 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async resetAdminTotp(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminIdParamDto,
  ): Promise<AdminAccountDto> {
    if (params.id === actor.id) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Your own authenticator is reset from the server console.',
      });
    }
    await this.admins.assertCanManage(actor, params.id);
    await this.auth.assertStepUp(actor.sessionId);
    return this.admins.resetTotp(actor, params.id);
  }
}
