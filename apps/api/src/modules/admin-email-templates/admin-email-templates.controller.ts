import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
  ALL_ADMIN_ROLES,
} from '../admin-auth/admin-auth.decorators';
import {
  EmailTemplateContentDto,
  EmailTemplateDetailDto,
  EmailTemplateParamDto,
  EmailTemplatePreviewDto,
  EmailTemplateSummaryDto,
  EmailTemplateTestResultDto,
  SaveEmailTemplateDto,
  TestEmailTemplateDto,
} from './admin-email-templates.dto';
import { AdminEmailTemplatesService } from './admin-email-templates.service';

const E = ErrorCode;

/** Owner 2026-10-02: editor of the transactional emails (super_admin). */
@ApiTags('admin-email-templates')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/email-templates')
export class AdminEmailTemplatesController {
  constructor(private readonly templates: AdminEmailTemplatesService) {}

  @Get()
  @ApiOperation({
    summary: 'Catalog of emails with override status per locale',
  })
  @ApiEnvelopeResponse(EmailTemplateSummaryDto, { isArray: true })
  listEmailTemplates(): Promise<EmailTemplateSummaryDto[]> {
    return this.templates.list();
  }

  @Get(':key/:locale')
  @ApiOperation({ summary: 'Built-in email (sample values) and the override' })
  @ApiEnvelopeResponse(EmailTemplateDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getEmailTemplate(
    @Param() p: EmailTemplateParamDto,
  ): Promise<EmailTemplateDetailDto> {
    return this.templates.get(p.key, p.locale);
  }

  @Put(':key/:locale')
  @ApiOperation({
    summary:
      'Save the override (sign-in/verification emails must keep {{code}})',
  })
  @ApiEnvelopeResponse(EmailTemplateDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  saveEmailTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: EmailTemplateParamDto,
    @Body() dto: SaveEmailTemplateDto,
  ): Promise<EmailTemplateDetailDto> {
    return this.templates.save(admin.id, p.key, p.locale, dto);
  }

  @Delete(':key/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset to the built-in email (removes the override)',
  })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  resetEmailTemplate(@Param() p: EmailTemplateParamDto): Promise<void> {
    return this.templates.reset(p.key, p.locale);
  }

  @Post(':key/:locale/preview')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Render the given text with sample values' })
  @ApiEnvelopeResponse(EmailTemplatePreviewDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  previewEmailTemplate(
    @Param() p: EmailTemplateParamDto,
    @Body() dto: EmailTemplateContentDto,
  ): EmailTemplatePreviewDto {
    return this.templates.preview(p.key, dto);
  }

  @Post(':key/:locale/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Send the email (given text, else saved override, else built-in) to my own address — 10/hour',
  })
  @ApiEnvelopeResponse(EmailTemplateTestResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    429: [E.RATE_LIMITED],
  })
  testEmailTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: EmailTemplateParamDto,
    @Body() dto: TestEmailTemplateDto,
  ): Promise<EmailTemplateTestResultDto> {
    return this.templates.sendTest(admin.id, p.key, p.locale, dto);
  }
}
