import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminAccountDto,
  AdminIdParamDto,
  CreateAdminDto,
  SetAdminRoleDto,
} from './admin.dto';
import { AdminsService } from './admins.service';

const E = ErrorCode;
const TARGET_ERRORS = { 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] };

/** docs/06 §2.3 item 13 — super_admin only (§2.2). The service writes
 * before/after audit rows itself. */
@ApiTags('admin-admins')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @ApiOperation({ summary: 'All administrator accounts' })
  @ApiEnvelopeResponse(AdminAccountDto, { isArray: true })
  listAdmins(): Promise<AdminAccountDto[]> {
    return this.admins.list();
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
    return this.admins.create(actor, dto.email, dto.role);
  }

  @Patch(':id/role')
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
