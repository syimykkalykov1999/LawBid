import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { RequiresDuty } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { ForwardMessagesDto, ForwardResponseDto } from './forward.dto';
import { ForwardService } from './forward.service';

/** Owner 2026-10-21 (Telegram «Переслать»). */
@ApiTags('chat')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
// OQ-048: assistants forward in the attorney's chats with the "chats" duty.
@RequiresDuty('chats')
@Controller('messages')
export class ForwardController {
  constructor(private readonly forwards: ForwardService) {}

  @Post('forward')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Forward messages / posts into chats, groups and channels (idempotent on requestId)',
  })
  @ApiEnvelopeResponse(ForwardResponseDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FORWARD_NOT_ALLOWED, ErrorCode.CONTENT_PROTECTED],
    404: [
      ErrorCode.NOT_FOUND,
      ErrorCode.CONVERSATION_NOT_FOUND,
      ErrorCode.GROUP_NOT_FOUND,
    ],
  })
  forward(
    @CurrentUser() user: RequestUser,
    @Body() dto: ForwardMessagesDto,
  ): Promise<ForwardResponseDto> {
    return this.forwards.forward(user, dto);
  }
}
