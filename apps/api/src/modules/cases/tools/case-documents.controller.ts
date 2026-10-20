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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../../admin-auth/admin-auth.decorators';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { CaseIdParamDto } from '../dto/case-requests.dto';
import {
  AdminFormTemplateDto,
  BuildDocumentDto,
  BuiltDocumentDto,
  CaseFormTemplatesDto,
  CreateFormTemplateDto,
  FormTemplateIdParamDto,
  UpdateFormTemplateDto,
} from './form-templates.dto';
import { FormTemplatesService } from './form-templates.service';

const E = ErrorCode;

/** Owner 2026-10-20: the attorney builds a document from a template. */
@ApiTags('case-documents')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('cases/:id/documents')
export class CaseDocumentsController {
  constructor(private readonly templates: FormTemplatesService) {}

  @Get('templates')
  @ApiOperation({
    summary: 'Published templates with their fields, and what the app prefills',
  })
  @ApiEnvelopeResponse(CaseFormTemplatesDto)
  @ApiErrors({
    403: [E.FORBIDDEN, E.ASSISTANT_NOT_ALLOWED],
    404: [E.CASE_NOT_FOUND],
  })
  listFormTemplates(@CurrentUser() u: RequestUser, @Param() p: CaseIdParamDto) {
    return this.templates.listForCase(u, p.id);
  }

  @Post('build')
  @ApiOperation({
    summary: 'Attorney: fill a template and get a PDF in the case files',
  })
  @ApiEnvelopeResponse(BuiltDocumentDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.ASSISTANT_NOT_ALLOWED],
    404: [E.CASE_NOT_FOUND, E.NOT_FOUND],
    409: [E.CASE_INVALID_STATE],
  })
  buildDocument(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: BuildDocumentDto,
  ) {
    return this.templates.build(u, p.id, dto);
  }
}

/** Owner 2026-10-20 — admin panel → Content → Case document forms. */
@ApiTags('admin-form-templates')
@AdminEndpoint('super_admin', 'moderator')
@SkipAutoAudit()
@Controller('admin/form-templates')
export class AdminFormTemplatesController {
  constructor(private readonly templates: FormTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'All form templates (drafts and published)' })
  @ApiEnvelopeResponse(AdminFormTemplateDto, { isArray: true })
  listAdminFormTemplates() {
    return this.templates.adminList();
  }

  @Post()
  @ApiOperation({ summary: 'Create a form template' })
  @ApiEnvelopeResponse(AdminFormTemplateDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 409: [E.VALIDATION_ERROR] })
  createAdminFormTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateFormTemplateDto,
  ) {
    return this.templates.create(admin, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One form template' })
  @ApiEnvelopeResponse(AdminFormTemplateDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getAdminFormTemplate(@Param() p: FormTemplateIdParamDto) {
    return this.templates.adminGet(p.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a form template (any field, publish)' })
  @ApiEnvelopeResponse(AdminFormTemplateDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateAdminFormTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: FormTemplateIdParamDto,
    @Body() dto: UpdateFormTemplateDto,
  ) {
    return this.templates.update(admin, p.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a form template (documents already built stay)',
  })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  deleteAdminFormTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: FormTemplateIdParamDto,
  ) {
    return this.templates.remove(admin, p.id);
  }
}
