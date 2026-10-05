import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminClientFraudService } from './admin-client-fraud.service';
import {
  FraudBanDto,
  FraudBanResultDto,
  FraudCardDto,
  FraudEventDto,
  FraudEventsQueryDto,
  FraudNoteDto,
  FraudPresetDto,
  FraudQueueItemDto,
  FraudQueueQueryDto,
  FraudReasonDto,
  FraudRecomputeAllResultDto,
  FraudSettingsDto,
  FraudStatsDto,
  FraudUserIdParamDto,
} from './client-fraud.dto';

const E = ErrorCode;
const ERRORS = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN],
  404: [E.NOT_FOUND],
};

/**
 * Owner 2026-10-05: Admin → Галочки → «Борьба с мошенниками» →
 * «Клиенты» (docs/CLIENT_FRAUD.md). Verifiers and the super admin
 * (`fraud` → area `verification`). The service writes its own audit rows.
 */
@ApiTags('admin-fraud')
@AdminEndpoint('verifier', 'super_admin')
@SkipAutoAudit()
@Controller('admin/fraud')
export class AdminClientFraudController {
  constructor(private readonly admin: AdminClientFraudService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Repeat-account rules and score thresholds' })
  @ApiEnvelopeResponse(FraudSettingsDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  getFraudSettings(): Promise<FraudSettingsDto> {
    return this.admin.settingsDto();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Change the rules and thresholds' })
  @ApiEnvelopeResponse(FraudSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  updateFraudSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: FraudSettingsDto,
  ): Promise<FraudSettingsDto> {
    return this.admin.updateSettings(admin, dto);
  }

  @Post('settings/preset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Выключить / Мягко / Стандарт / Строго' })
  @ApiEnvelopeResponse(FraudSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  applyFraudPreset(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: FraudPresetDto,
  ): Promise<FraudSettingsDto> {
    return this.admin.preset(admin, dto.preset);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Queue, restricted, blocked, refused sign-ins' })
  @ApiEnvelopeResponse(FraudStatsDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  getFraudStats(): Promise<FraudStatsDto> {
    return this.admin.stats();
  }

  @Get('queue')
  @ApiOperation({
    summary: 'Accounts waiting for a check, highest score first',
  })
  @ApiEnvelopeResponse(FraudQueueItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  listFraudQueue(@Query() q: FraudQueueQueryDto): Promise<FraudQueueItemDto[]> {
    return this.admin.queue(q);
  }

  @Get('events')
  @ApiOperation({ summary: 'Decision history (staff or automatic)' })
  @ApiEnvelopeResponse(FraudEventDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  listFraudEvents(@Query() q: FraudEventsQueryDto): Promise<FraudEventDto[]> {
    return this.admin.events(q);
  }

  @Post('recompute-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-score every client active in the last year' })
  @ApiEnvelopeResponse(FraudRecomputeAllResultDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  recomputeAllFraud(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<FraudRecomputeAllResultDto> {
    return this.admin.recomputeAll(admin);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'One account: score, linked accounts, history' })
  @ApiEnvelopeResponse(FraudCardDto)
  @ApiErrors(ERRORS)
  getFraudCard(@Param() p: FraudUserIdParamDto): Promise<FraudCardDto> {
    return this.admin.card(p.userId);
  }

  @Post('users/:userId/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '«Снять»: checked, nothing wrong (restores a block)',
  })
  @ApiEnvelopeResponse(FraudCardDto)
  @ApiErrors(ERRORS)
  clearFraud(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: FraudUserIdParamDto,
    @Body() dto: FraudNoteDto,
  ): Promise<FraudCardDto> {
    return this.admin.clear(admin, p.userId, dto.note ?? null);
  }

  @Post('users/:userId/restrict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '«Ограничить»: no cases, no messages to attorneys' })
  @ApiEnvelopeResponse(FraudCardDto)
  @ApiErrors(ERRORS)
  restrictFraud(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: FraudUserIdParamDto,
    @Body() dto: FraudReasonDto,
  ): Promise<FraudCardDto> {
    return this.admin.restrict(admin, p.userId, dto.note);
  }

  @Post('users/:userId/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '«Заблокировать» (optionally every linked account)',
  })
  @ApiEnvelopeResponse(FraudBanResultDto)
  @ApiErrors(ERRORS)
  banFraud(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: FraudUserIdParamDto,
    @Body() dto: FraudBanDto,
  ): Promise<FraudBanResultDto> {
    return this.admin.ban(admin, p.userId, dto);
  }

  @Post('users/:userId/recompute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-score one account now' })
  @ApiEnvelopeResponse(FraudCardDto)
  @ApiErrors(ERRORS)
  recomputeFraud(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: FraudUserIdParamDto,
  ): Promise<FraudCardDto> {
    return this.admin.recompute(admin, p.userId);
  }
}
