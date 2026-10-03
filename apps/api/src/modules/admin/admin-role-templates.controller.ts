import {
  Body,
  Controller,
  Delete,
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
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminIdParamDto,
  AdminRoleTemplateDto,
  SaveAdminRoleTemplateDto,
} from './admin.dto';
import { AdminRoleTemplatesService } from './admin-role-templates.service';

const E = ErrorCode;

/** Same door as /admin/admins: the super admin or an admin given the
 * manage-admins right. The service writes its own audit rows. */
@ApiTags('admin-admins')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin/admins/templates')
export class AdminRoleTemplatesController {
  constructor(private readonly templates: AdminRoleTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Saved rights templates' })
  @ApiEnvelopeResponse(AdminRoleTemplateDto, { isArray: true })
  listTemplates(): Promise<AdminRoleTemplateDto[]> {
    return this.templates.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a named set of rights' })
  @ApiEnvelopeResponse(AdminRoleTemplateDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  createTemplate(
    @CurrentAdmin() actor: AdminActor,
    @Body() dto: SaveAdminRoleTemplateDto,
  ): Promise<AdminRoleTemplateDto> {
    return this.templates.create(actor, dto.name, dto.permissions);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename or change a template' })
  @ApiEnvelopeResponse(AdminRoleTemplateDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  updateTemplate(
    @CurrentAdmin() actor: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: SaveAdminRoleTemplateDto,
  ): Promise<AdminRoleTemplateDto> {
    return this.templates.update(actor, p.id, dto.name, dto.permissions);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template (admins keep their rights)' })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  async deleteTemplate(
    @CurrentAdmin() actor: AdminActor,
    @Param() p: AdminIdParamDto,
  ): Promise<void> {
    await this.templates.remove(actor, p.id);
  }
}
