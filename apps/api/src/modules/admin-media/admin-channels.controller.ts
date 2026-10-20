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
  AdminChannelDto,
  AdminChannelIdParamDto,
  AdminChannelPostActionDto,
  AdminChannelPostParamDto,
  AdminChannelRowDto,
  AdminChannelsQueryDto,
  AdminChannelStatusDto,
} from './admin-channels.dto';
import { AdminChannelsService } from './admin-channels.service';

const E = ErrorCode;

/** Owner 2026-10-20 — admin panel → Media → Channels. The path segment
 * `media` puts it under the same access area as reels and stickers. */
@ApiTags('admin-media')
@AdminEndpoint('super_admin', 'moderator')
@SkipAutoAudit()
@Controller('admin/media/channels')
export class AdminChannelsController {
  constructor(private readonly channels: AdminChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'Channels, newest first' })
  @ApiEnvelopeResponse(AdminChannelRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  list(
    @Query() q: AdminChannelsQueryDto,
  ): Promise<{ items: AdminChannelRowDto[]; nextCursor: string | null }> {
    return this.channels.list(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A channel with its latest posts' })
  @ApiEnvelopeResponse(AdminChannelDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  get(@Param() p: AdminChannelIdParamDto): Promise<AdminChannelDto> {
    return this.channels.get(p.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hide (out of search), close (banned) or reopen a channel',
  })
  @ApiEnvelopeResponse(AdminChannelDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.CONTENT_INVALID_STATE] })
  setStatus(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminChannelIdParamDto,
    @Body() dto: AdminChannelStatusDto,
  ): Promise<AdminChannelDto> {
    return this.channels.setStatus(admin, p.id, dto.status, dto.reason);
  }

  @Post(':id/posts/:postId/moderate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove or restore one post of a channel' })
  @ApiEnvelopeResponse(AdminChannelDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.CONTENT_INVALID_STATE] })
  moderatePost(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminChannelPostParamDto,
    @Body() dto: AdminChannelPostActionDto,
  ): Promise<AdminChannelDto> {
    return this.channels.moderatePost(
      admin,
      p.id,
      p.postId,
      dto.action,
      dto.reason,
    );
  }
}
