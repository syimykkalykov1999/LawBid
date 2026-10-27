import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  StaffAiHintDto,
  StaffAiHintParamDto,
  StaffAiSummaryDto,
  StaffAiSummaryParamDto,
} from './staff-ai.dto';
import { StaffAiHintService } from './staff-ai-hint.service';
import { StaffAiSummaryService } from './staff-ai-summary.service';

/**
 * Staff package: `admin/desk/ai/*` — AI mode (master switch staff.ai_enabled,
 * off = zero AI calls). Under the admin guard (deny by default). Both routes
 * answer 404 while their switch is off, like a route that does not exist.
 */
// flag: none gated by the staff.ai_enabled master switch and its own sub-switch (off by default → 404, no AI call)
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/desk/ai')
export class StaffAiController {
  constructor(
    private readonly hints: StaffAiHintService,
    private readonly summaries: StaffAiSummaryService,
  ) {}

  @Get('hint/:kind/:itemId')
  @ApiOperation({
    summary:
      'AI suggestion for an item the caller holds (one call, 3 s timeout, cached; a suggestion only)',
  })
  @ApiEnvelopeResponse(StaffAiHintDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  staffAiHint(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: StaffAiHintParamDto,
  ): Promise<StaffAiHintDto> {
    return this.hints.hint(admin, params.kind, params.itemId);
  }

  @Get('summary/:suggestionId')
  @ApiOperation({
    summary:
      'Evidence text under a recommendation: AI text if written, else the rule-based template',
  })
  @ApiEnvelopeResponse(StaffAiSummaryDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  staffAiSummary(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: StaffAiSummaryParamDto,
  ): Promise<StaffAiSummaryDto> {
    return this.summaries.get(admin, params.suggestionId);
  }
}
