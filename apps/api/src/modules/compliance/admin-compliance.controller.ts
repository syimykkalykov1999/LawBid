import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  FlagMinorDto,
  MinorActionResultDto,
  MinorsListDto,
  MinorUserParamDto,
  SmsOptOutImportDto,
  SmsOptOutImportResultDto,
} from './admin-compliance.dto';
import { AdminComplianceService } from './admin-compliance.service';

/** 2026-10-25 (COPPA / TCPA): minors tool and Twilio opt-out import. */
@ApiTags('admin-compliance')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/compliance')
export class AdminComplianceController {
  constructor(
    private readonly compliance: AdminComplianceService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get('minors')
  @ApiOperation({
    summary:
      'Accounts flagged as minors, and accounts whose birth date is under the minimum age',
  })
  @ApiEnvelopeResponse(MinorsListDto)
  async minors(): Promise<MinorsListDto> {
    return { items: await this.compliance.list() };
  }

  @Post('minors/:id/flag')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Flag an account as a minor: sessions revoked, account suspended, contacts put on the stop-lists',
  })
  @ApiEnvelopeResponse(MinorActionResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  flag(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: MinorUserParamDto,
    @Body() dto: FlagMinorDto,
  ): Promise<MinorActionResultDto> {
    return this.compliance.flag(admin, p.id, dto.reason);
  }

  @Post('minors/:id/clear')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'The flag was a mistake: restore the account' })
  @ApiEnvelopeResponse(MinorActionResultDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  clear(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: MinorUserParamDto,
  ): Promise<MinorActionResultDto> {
    return this.compliance.clear(admin, p.id);
  }

  @Post('minors/:id/delete')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Delete a flagged minor account now (anonymization). Needs a fresh 2FA step-up.',
  })
  @ApiEnvelopeResponse(MinorActionResultDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async deleteMinor(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: MinorUserParamDto,
  ): Promise<MinorActionResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.compliance.deleteMinor(admin, p.id);
  }

  @Post('sms/opt-outs/import')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Add numbers from Twilio’s opt-out export to the text-message stop-list. Needs a fresh 2FA step-up.',
  })
  @ApiEnvelopeResponse(SmsOptOutImportResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async importOptOuts(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: SmsOptOutImportDto,
  ): Promise<SmsOptOutImportResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.compliance.importSmsOptOuts(admin, dto.phones);
  }
}
