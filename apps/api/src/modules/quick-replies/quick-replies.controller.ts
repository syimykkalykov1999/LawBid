import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
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
import {
  QuickReplyDto,
  QuickReplyInputDto,
  QuickReplyListDto,
  QuickReplyParamDto,
} from './quick-replies.dto';
import { QuickRepliesService } from './quick-replies.service';

/** Owner 2026-11-02: quick replies (WhatsApp Business) for the chat composer. */
@ApiTags('quick-replies')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@RequiresDuty('chats')
@Controller('quick-replies')
export class QuickRepliesController {
  constructor(private readonly replies: QuickRepliesService) {}

  @Get()
  @ApiOperation({ summary: 'My quick replies in my order' })
  @ApiEnvelopeResponse(QuickReplyListDto)
  async listQuickReplies(
    @CurrentUser() user: RequestUser,
  ): Promise<QuickReplyListDto> {
    return { items: await this.replies.list(user) };
  }

  @Post()
  @ApiOperation({ summary: 'Add a quick reply (at most 50)' })
  @ApiEnvelopeResponse(QuickReplyDto, { status: 201 })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  createQuickReply(
    @CurrentUser() user: RequestUser,
    @Body() body: QuickReplyInputDto,
  ): Promise<QuickReplyDto> {
    return this.replies.create(user, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a quick reply' })
  @ApiEnvelopeResponse(QuickReplyDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR], 404: [ErrorCode.NOT_FOUND] })
  updateQuickReply(
    @CurrentUser() user: RequestUser,
    @Param() p: QuickReplyParamDto,
    @Body() body: QuickReplyInputDto,
  ): Promise<QuickReplyDto> {
    return this.replies.update(user, p.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a quick reply; idempotent' })
  deleteQuickReply(
    @CurrentUser() user: RequestUser,
    @Param() p: QuickReplyParamDto,
  ): Promise<void> {
    return this.replies.remove(user, p.id);
  }
}
