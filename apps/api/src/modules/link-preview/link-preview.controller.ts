import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { LinkPreviewDto, LinkPreviewQueryDto } from './link-preview.dto';
import { LinkPreviewService } from './link-preview.service';

/** Owner 2026-10-22: chat link cards (title, text, picture, site). */
@ApiTags('link-preview')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('link-preview')
export class LinkPreviewController {
  constructor(private readonly service: LinkPreviewService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Preview card of a link (Open Graph), fetched safely by the server',
  })
  @ApiEnvelopeResponse(LinkPreviewDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  get(
    @CurrentUser() user: RequestUser,
    @Query() q: LinkPreviewQueryDto,
  ): Promise<LinkPreviewDto> {
    return this.service.preview(user.sub, q.url);
  }
}
