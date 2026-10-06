import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminOutreachService } from './admin-outreach.service';
import {
  OutreachActivityInputDto,
  OutreachAssignDto,
  OutreachAssignResultDto,
  OutreachContextDto,
  OutreachImportQueryDto,
  OutreachImportReportDto,
  OutreachLeadDetailDto,
  OutreachLeadIdParamDto,
  OutreachLeadInputDto,
  OutreachLeadRowDto,
  OutreachLeadsQueryDto,
  OutreachRegistryImportDto,
  OutreachSendEmailDto,
  OutreachSendEmailResultDto,
  OutreachSettingsDto,
  OutreachStatsDto,
  OutreachStatsQueryDto,
  OutreachSuppressionsAddDto,
  OutreachSuppressionsAddResultDto,
  OutreachSuppressionsDto,
  OutreachTemplateDto,
  OutreachTemplateIdParamDto,
  OutreachTemplateInputDto,
} from './outreach.dto';
import type { OutreachSettings } from './outreach.settings';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const LEAD_ERRORS = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN],
  404: [E.NOT_FOUND],
  409: [
    E.OUTREACH_INVALID_STATE,
    E.OUTREACH_CONTACT_BLOCKED,
    E.OUTREACH_CLIENTS_DISABLED,
  ],
};

/**
 * Owner 2026-10-05: outreach (Привлечение) in the admin. Area `outreach`
 * (view/manage) for any admin; an admin who is also a partner is an
 * employee and sees only their own leads; the super admin and non-partner
 * admins with the area are managers.
 */
@ApiTags('admin-outreach')
@AdminEndpoint('super_admin', 'finance', 'support', 'moderator', 'verifier')
@Controller('admin/outreach')
export class AdminOutreachController {
  constructor(private readonly outreach: AdminOutreachService) {}

  @Get('context')
  @ApiOperation({
    summary: 'Who I am in outreach: scope, partners to assign, settings',
  })
  @ApiEnvelopeResponse(OutreachContextDto)
  outreachContext(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<OutreachContextDto> {
    return this.outreach.context(admin);
  }

  @Put('settings')
  @Roles('super_admin')
  @ApiOperation({
    summary:
      'Email limits, sender name, postal address, public API URL, TCPA/DNC rules, retention',
  })
  @ApiEnvelopeResponse(OutreachSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  outreachUpdateSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: OutreachSettingsDto,
  ): Promise<OutreachSettings> {
    return this.outreach.updateSettings(admin, dto);
  }

  @Get('stats')
  @ApiOperation({
    summary:
      'Per employee: leads, calls, emails, answers, registrations, payments, commissions',
  })
  @ApiEnvelopeResponse(OutreachStatsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  outreachStats(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: OutreachStatsQueryDto,
  ): Promise<OutreachStatsDto> {
    return this.outreach.stats(admin, q);
  }

  @Get('leads')
  @ApiOperation({ summary: 'Leads, newest first (an employee sees their own)' })
  @ApiEnvelopeResponse(OutreachLeadRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  outreachListLeads(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: OutreachLeadsQueryDto,
  ): Promise<Page<OutreachLeadRowDto>> {
    return this.outreach.list(admin, q);
  }

  @Get('leads/export.csv')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Leads as CSV (managers)' })
  @ApiProduces('text/csv')
  async exportLeads(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: OutreachLeadsQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.outreach.exportCsv(admin, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="outreach-leads.csv"',
    );
    res.send(`\ufeff${csv}`);
  }

  @Post('leads')
  @ApiOperation({ summary: 'Add one lead by hand' })
  @ApiEnvelopeResponse(OutreachLeadDetailDto, { status: HttpStatus.CREATED })
  @ApiErrors(LEAD_ERRORS)
  outreachCreateLead(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: OutreachLeadInputDto,
  ): Promise<OutreachLeadDetailDto> {
    return this.outreach.create(admin, dto);
  }

  @Post('leads/import')
  @ApiOperation({
    summary: 'Import leads from a CSV export (dry-run by default)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'CSV, ≤ 10 MB, ≤ 5000 rows; needs an email or phone column.',
        },
      },
    },
  })
  @ApiEnvelopeResponse(OutreachImportReportDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.OUTREACH_IMPORT_INVALID],
    403: [E.FORBIDDEN],
    409: [E.OUTREACH_CLIENTS_DISABLED],
    413: [E.VALIDATION_ERROR],
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }),
  )
  outreachImportCsv(
    @CurrentAdmin() admin: AdminActor,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() q: OutreachImportQueryDto,
  ): Promise<OutreachImportReportDto> {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException({
        code: E.OUTREACH_IMPORT_INVALID,
        message: 'A non-empty CSV file is required (multipart field "file").',
      });
    }
    return this.outreach.importCsv(admin, file.buffer, q);
  }

  @Post('leads/import-registry')
  @ApiOperation({
    summary: 'Import lawyers from a free public state registry (NY open data)',
  })
  @ApiEnvelopeResponse(OutreachImportReportDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.OUTREACH_IMPORT_INVALID],
    403: [E.FORBIDDEN],
  })
  outreachImportRegistry(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: OutreachRegistryImportDto,
  ): Promise<OutreachImportReportDto> {
    return this.outreach.importRegistry(admin, dto);
  }

  @Post('leads/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign (or unassign) many leads to an employee' })
  @ApiEnvelopeResponse(OutreachAssignResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
  })
  outreachAssign(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: OutreachAssignDto,
  ): Promise<OutreachAssignResultDto> {
    return this.outreach.assign(admin, dto);
  }

  @Get('leads/:id')
  @ApiOperation({ summary: 'One lead with its activity log' })
  @ApiEnvelopeResponse(OutreachLeadDetailDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  outreachLead(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: OutreachLeadIdParamDto,
  ): Promise<OutreachLeadDetailDto> {
    return this.outreach.detail(admin, p.id);
  }

  @Patch('leads/:id')
  @ApiOperation({ summary: 'Edit a lead (fields, status, assignee)' })
  @ApiEnvelopeResponse(OutreachLeadDetailDto)
  @ApiErrors(LEAD_ERRORS)
  outreachUpdateLead(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: OutreachLeadIdParamDto,
    @Body() dto: OutreachLeadInputDto,
  ): Promise<OutreachLeadDetailDto> {
    return this.outreach.update(admin, p.id, dto);
  }

  @Post('leads/:id/activities')
  @ApiOperation({ summary: 'Log a call (with outcome) or a note' })
  @ApiEnvelopeResponse(OutreachLeadDetailDto, { status: HttpStatus.CREATED })
  @ApiErrors(LEAD_ERRORS)
  outreachAddActivity(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: OutreachLeadIdParamDto,
    @Body() dto: OutreachActivityInputDto,
  ): Promise<OutreachLeadDetailDto> {
    return this.outreach.addActivity(admin, p.id, dto);
  }

  @Post('leads/:id/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send one cold email from a template with the partner link',
  })
  @ApiEnvelopeResponse(OutreachSendEmailResultDto)
  @ApiErrors({ ...LEAD_ERRORS, 429: [E.OUTREACH_EMAIL_LIMIT] })
  outreachSendEmail(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: OutreachLeadIdParamDto,
    @Body() dto: OutreachSendEmailDto,
  ): Promise<OutreachSendEmailResultDto> {
    return this.outreach.sendEmail(admin, p.id, dto);
  }

  @Get('suppressions')
  @ApiOperation({
    summary: 'Stop-list (do not call / write): count and the latest entries',
  })
  @ApiEnvelopeResponse(OutreachSuppressionsDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  outreachSuppressions(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<OutreachSuppressionsDto> {
    return this.outreach.suppressions(admin);
  }

  @Post('suppressions')
  @ApiOperation({
    summary:
      'Add phones / e-mails to the stop-list; matching leads become do-not-contact (managers)',
  })
  @ApiEnvelopeResponse(OutreachSuppressionsAddResultDto, {
    status: HttpStatus.CREATED,
  })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  outreachAddSuppressions(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: OutreachSuppressionsAddDto,
  ): Promise<OutreachSuppressionsAddResultDto> {
    return this.outreach.addSuppressions(admin, dto);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Cold-email templates' })
  @ApiEnvelopeResponse(OutreachTemplateDto, { isArray: true })
  outreachTemplates(): Promise<OutreachTemplateDto[]> {
    return this.outreach.templates();
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create a template (managers)' })
  @ApiEnvelopeResponse(OutreachTemplateDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  outreachCreateTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: OutreachTemplateInputDto,
  ): Promise<OutreachTemplateDto> {
    return this.outreach.saveTemplate(admin, dto);
  }

  @Put('templates/:id')
  @ApiOperation({ summary: 'Edit a template (managers)' })
  @ApiEnvelopeResponse(OutreachTemplateDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
  })
  outreachUpdateTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: OutreachTemplateIdParamDto,
    @Body() dto: OutreachTemplateInputDto,
  ): Promise<OutreachTemplateDto> {
    return this.outreach.saveTemplate(admin, dto, p.id);
  }
}
