import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import {
  ModerationActionDto,
  ModerationActionResultDto,
  ModerationCardDto,
  ModerationQueueItemDto,
  ModerationQueueQueryDto,
  ModerationTargetParamDto,
  type ModerationQueuePage,
} from './admin-moderation.dto';
import { AdminModerationService } from './admin-moderation.service';

const E = ErrorCode;

/** docs/06 §3.2 — super_admin and moderator (§2.2). Actions write their
 * own audit rows (before/after). */
@ApiTags('admin-moderation')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/moderation')
export class AdminModerationController {
  constructor(private readonly moderation: AdminModerationService) {}

  @Get('queue')
  @ApiOperation({ summary: 'Reports grouped by object, oldest first' })
  @ApiEnvelopeResponse(ModerationQueueItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  moderationQueue(
    @Query() query: ModerationQueueQueryDto,
  ): Promise<ModerationQueuePage> {
    return this.moderation.queue(query);
  }

  @Get('targets/:type/:id')
  @ApiOperation({ summary: 'Object, its reports, author and history' })
  @ApiEnvelopeResponse(ModerationCardDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  moderationCard(
    @Param() params: ModerationTargetParamDto,
  ): Promise<ModerationCardDto> {
    return this.moderation.card(params.type, params.id);
  }

  @Post('targets/:type/:id/actions')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'hide / remove / warn / suspend / restore / dismiss (reason required)',
  })
  @ApiEnvelopeResponse(ModerationActionResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.MODERATION_ACTION_NOT_APPLICABLE, E.ACCOUNT_SUSPENDED],
  })
  moderationAct(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: ModerationTargetParamDto,
    @Body() dto: ModerationActionDto,
  ): Promise<ModerationActionResultDto> {
    return this.moderation.act(
      admin,
      params.type,
      params.id,
      dto.action,
      dto.reason,
    );
  }
}
