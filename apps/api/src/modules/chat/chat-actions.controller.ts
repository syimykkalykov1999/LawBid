import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
import { ChatActionsService } from './chat-actions.service';
import {
  ConversationIdParamDto,
  DeleteMessageQueryDto,
  EditMessageDto,
  MessageDto,
  MessageIdParamDto,
  PinsDto,
  ReactMessageDto,
} from './chat.dto';

/** Owner 2026-10-20: edit, delete, react, pin (WhatsApp / Telegram). */
@ApiTags('chat')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@RequiresDuty('chats')
@Controller('conversations')
export class ChatActionsController {
  constructor(private readonly actions: ChatActionsService) {}

  @Patch(':id/messages/:messageId')
  @ApiOperation({ summary: 'Edit your text message within the edit window' })
  @ApiEnvelopeResponse(MessageDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.MESSAGE_WINDOW_EXPIRED, ErrorCode.CONVERSATION_CLOSED],
  })
  editChatMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: MessageIdParamDto,
    @Body() dto: EditMessageDto,
  ): Promise<MessageDto> {
    return this.actions.edit(user, p.id, p.messageId, dto.body);
  }

  @Delete(':id/messages/:messageId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a message for me or (within the window) for everyone',
  })
  @ApiErrors({
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.MESSAGE_WINDOW_EXPIRED],
  })
  async deleteChatMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: MessageIdParamDto,
    @Query() q: DeleteMessageQueryDto,
  ): Promise<void> {
    await this.actions.remove(user, p.id, p.messageId, q.scope);
  }

  @Put(':id/messages/:messageId/reaction')
  @ApiOperation({ summary: 'React with one emoji (null removes it)' })
  @ApiEnvelopeResponse(MessageDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
  })
  reactToChatMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: MessageIdParamDto,
    @Body() dto: ReactMessageDto,
  ): Promise<MessageDto> {
    return this.actions.react(user, p.id, p.messageId, dto.emoji);
  }

  @Post(':id/messages/:messageId/pin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pin a message to the top of the chat' })
  @ApiEnvelopeResponse(MessageDto)
  @ApiErrors({
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.MESSAGE_PIN_LIMIT],
  })
  pinChatMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: MessageIdParamDto,
  ): Promise<MessageDto> {
    return this.actions.pin(user, p.id, p.messageId, true);
  }

  @Delete(':id/messages/:messageId/pin')
  @ApiOperation({ summary: 'Unpin a message' })
  @ApiEnvelopeResponse(MessageDto)
  @ApiErrors({
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
  })
  unpinChatMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: MessageIdParamDto,
  ): Promise<MessageDto> {
    return this.actions.pin(user, p.id, p.messageId, false);
  }

  @Get(':id/pins')
  @ApiOperation({ summary: "The chat's pinned messages" })
  @ApiEnvelopeResponse(PinsDto)
  @ApiErrors({ 404: [ErrorCode.CONVERSATION_NOT_FOUND] })
  async listChatPins(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
  ): Promise<PinsDto> {
    return { items: await this.actions.pins(user, p.id) };
  }
}
