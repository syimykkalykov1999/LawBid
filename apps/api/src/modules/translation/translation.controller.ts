import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { ContentTranslationService } from './content-translation.service';
import { ContentTranslationDto, TranslateContentDto } from './translation.dto';

/** Owner 2026-10-05: «Перевести» on posts, comments, cases, bids, reviews
 * and bios (chat messages keep their own endpoint). */
@ApiTags('translations')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('translations')
export class TranslationController {
  constructor(private readonly content: ContentTranslationService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Translate a post, comment, case, bid, review or bio',
  })
  @ApiEnvelopeResponse(ContentTranslationDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.NOT_FOUND],
    429: [ErrorCode.RATE_LIMITED],
    503: [ErrorCode.TRANSLATION_UNAVAILABLE],
  })
  translate(
    @CurrentUser() user: RequestUser,
    @Body() dto: TranslateContentDto,
  ): Promise<ContentTranslationDto> {
    return this.content.translate(user, dto.kind, dto.id, dto.target);
  }
}
