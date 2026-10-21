import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
import {
  SavedChatIdsDto,
  SavedChatItemDto,
  SavedChatMessageParamDto,
  SavedChatQueryDto,
} from './chat-saved.dto';
import { ChatSavedService } from './chat-saved.service';

/** Owner 2026-10-20: «Сохранённое» — chat messages, files, links and voice
 * notes kept for later. */
@ApiTags('chat-saved')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@RequiresDuty('chats')
@Controller('saved-chat')
export class ChatSavedController {
  constructor(private readonly saved: ChatSavedService) {}

  @Get()
  @ApiOperation({ summary: 'My saved chat messages, newest saved first' })
  @ApiEnvelopeResponse(SavedChatItemDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  listSavedChat(
    @CurrentUser() user: RequestUser,
    @Query() q: SavedChatQueryDto,
  ): Promise<{ items: SavedChatItemDto[]; nextCursor: string | null }> {
    return this.saved.list(user, q.tab, q.q, q.cursor);
  }

  @Get('ids')
  @ApiOperation({ summary: 'Ids of my saved chat messages' })
  @ApiEnvelopeResponse(SavedChatIdsDto)
  async savedChatIds(
    @CurrentUser() user: RequestUser,
  ): Promise<SavedChatIdsDto> {
    return { ids: await this.saved.ids(user) };
  }

  @Put(':messageId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Save a chat message; idempotent' })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.CONVERSATION_NOT_FOUND],
  })
  saveChatMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: SavedChatMessageParamDto,
  ): Promise<void> {
    return this.saved.save(user, p.messageId);
  }

  @Delete(':messageId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a chat message from the saved; idempotent' })
  unsaveChatMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: SavedChatMessageParamDto,
  ): Promise<void> {
    return this.saved.remove(user, p.messageId);
  }
}
