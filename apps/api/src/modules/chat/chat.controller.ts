import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import {
  ConversationDto,
  ConversationIdParamDto,
  ConversationsQueryDto,
  MessageDto,
  MessagesQueryDto,
  MuteConversationDto,
  ReadConversationDto,
  ReadResultDto,
  SendMessageDto,
  type ConversationPage,
  type MessagePage,
} from './chat.dto';
import { ChatService } from './chat.service';

/** docs/05 §8, §15 "Чаты" (stage 5.7). */
@ApiTags('chat')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'My conversations, newest first (§8.1)' })
  @ApiEnvelopeResponse(ConversationDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  listConversations(
    @CurrentUser() user: RequestUser,
    @Query() q: ConversationsQueryDto,
  ): Promise<ConversationPage> {
    return this.chat.list(user, q.cursor, q.updatedSince);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One conversation' })
  @ApiEnvelopeResponse(ConversationDto)
  @ApiErrors({ 404: [ErrorCode.CONVERSATION_NOT_FOUND] })
  getConversation(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
  ): Promise<ConversationDto> {
    return this.chat.get(user, p.id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Messages, newest first; or after an id (§8.5)' })
  @ApiEnvelopeResponse(MessageDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.CONVERSATION_NOT_FOUND],
  })
  listMessages(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Query() q: MessagesQueryDto,
  ): Promise<MessagePage> {
    return this.chat.messages(user, p.id, q.cursor, q.afterId);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send, idempotent on clientMessageId (§8.4)' })
  @ApiEnvelopeResponse(MessageDto, { status: 201 })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.MESSAGE_TOO_LONG],
    403: [ErrorCode.SUBSCRIPTION_REQUIRED],
    404: [ErrorCode.CONVERSATION_NOT_FOUND],
    409: [ErrorCode.CONVERSATION_CLOSED],
    429: [ErrorCode.RATE_LIMITED],
  })
  sendMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.chat.send(user, p.id, dto);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark read up to a message (§8.4)' })
  @ApiEnvelopeResponse(ReadResultDto)
  @ApiErrors({
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
  })
  readConversation(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: ReadConversationDto,
  ): Promise<{ lastReadMessageId: string | null }> {
    return this.chat.read(user, p.id, dto.lastReadMessageId);
  }

  @Patch(':id/mute')
  @ApiOperation({ summary: 'Mute push until a time; null unmutes (§8.4)' })
  @ApiEnvelopeResponse(ConversationDto)
  @ApiErrors({ 404: [ErrorCode.CONVERSATION_NOT_FOUND] })
  muteConversation(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: MuteConversationDto,
  ): Promise<ConversationDto> {
    return this.chat.mute(user, p.id, dto.until);
  }
}
