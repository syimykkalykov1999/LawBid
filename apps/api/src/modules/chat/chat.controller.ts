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
  MessageIdParamDto,
  ConversationsQueryDto,
  MessageDto,
  MessagesQueryDto,
  MuteConversationDto,
  ReadConversationDto,
  ReadResultDto,
  RequestsCountDto,
  SendMessageDto,
  StartDirectChatDto,
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
    return this.chat.list(user, q.cursor, q.updatedSince, q.folder);
  }

  @Get('requests/count')
  @ApiOperation({ summary: 'Message requests waiting for me (OQ-043)' })
  @ApiEnvelopeResponse(RequestsCountDto)
  requestsCount(@CurrentUser() user: RequestUser): Promise<{ count: number }> {
    return this.chat.requestsCount(user);
  }

  @Post('direct')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Open the direct chat with a person ("Message" on a profile)',
  })
  @ApiEnvelopeResponse(ConversationDto)
  @ApiErrors({
    403: [ErrorCode.USER_BLOCKED],
    404: [ErrorCode.NOT_FOUND],
    409: [ErrorCode.DIRECT_CHAT_NOT_ALLOWED],
  })
  startDirectChat(
    @CurrentUser() user: RequestUser,
    @Body() dto: StartDirectChatDto,
  ): Promise<ConversationDto> {
    return this.chat.startDirect(user, dto.userId);
  }

  @Post(':id/request/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept a message request (OQ-043)' })
  @ApiEnvelopeResponse(ConversationDto)
  @ApiErrors({ 404: [ErrorCode.CONVERSATION_NOT_FOUND] })
  acceptMessageRequest(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
  ): Promise<ConversationDto> {
    return this.chat.answerRequest(user, p.id, true);
  }

  @Post(':id/request/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a message request (OQ-043)' })
  @ApiEnvelopeResponse(ConversationDto)
  @ApiErrors({ 404: [ErrorCode.CONVERSATION_NOT_FOUND] })
  declineMessageRequest(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
  ): Promise<ConversationDto> {
    return this.chat.answerRequest(user, p.id, false);
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
    403: [ErrorCode.SUBSCRIPTION_REQUIRED, ErrorCode.MESSAGE_REQUEST_DECLINED],
    404: [ErrorCode.CONVERSATION_NOT_FOUND],
    409: [ErrorCode.CONVERSATION_CLOSED, ErrorCode.MESSAGE_REQUEST_LIMIT],
    429: [ErrorCode.RATE_LIMITED],
  })
  sendMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.chat.send(user, p.id, dto);
  }

  @Post(':id/messages/:messageId/listened')
  @HttpCode(200)
  @ApiOperation({ summary: 'The recipient played a voice message (OQ-040)' })
  @ApiEnvelopeResponse(MessageDto)
  @ApiErrors({
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
  })
  voiceListened(
    @CurrentUser() user: RequestUser,
    @Param() p: MessageIdParamDto,
  ): Promise<MessageDto> {
    return this.chat.listened(user, p.id, p.messageId);
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
    return this.chat.mute(user, p.id, dto.until ?? null);
  }
}
