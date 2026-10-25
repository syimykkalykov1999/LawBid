import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  PrivateRead,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  CaseFileParamDto,
  CaseIdParamDto,
  ConversationIdParamDto,
  MessageIdParamDto,
  PrivateCallsDto,
  PrivateCaseFilesDto,
  PrivateFileUrlDto,
  PrivateMessagesPageDto,
  PrivateMessagesQueryDto,
  RevealedMessageDto,
} from './admin-private-content.dto';
import { AdminPrivateContentService } from './admin-private-content.service';

const E = ErrorCode;
const READ_ERRORS = {
  400: [E.JUSTIFICATION_REQUIRED, E.REASON_CODE_REQUIRED],
  403: [E.FORBIDDEN],
  404: [E.NOT_FOUND],
};
const REVEAL_ERRORS = {
  ...READ_ERRORS,
  403: [E.FORBIDDEN, E.ADMIN_STEP_UP_REQUIRED],
  503: [E.AUDIT_UNAVAILABLE],
};

/**
 * Owner 2026-10-28: private content (1:1 chats, calls, case files). Every
 * route needs X-Reason-Code + X-Justification and is audited before it
 * runs; texts and files additionally need a fresh authenticator code.
 */
@ApiTags('admin-private-content')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/private-content')
export class AdminPrivateContentController {
  constructor(private readonly service: AdminPrivateContentService) {}

  @Get('conversations/:id/messages')
  @PrivateRead('chat_messages')
  @ApiOperation({
    summary:
      'Messages of one conversation WITHOUT their text (audited, reason code + text)',
  })
  @ApiEnvelopeResponse(PrivateMessagesPageDto)
  @ApiErrors({ ...READ_ERRORS, 503: [E.AUDIT_UNAVAILABLE] })
  listMessages(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: ConversationIdParamDto,
    @Query() query: PrivateMessagesQueryDto,
  ): Promise<PrivateMessagesPageDto> {
    return this.service.listMessages(admin, params.id, query.cursor, query.limit);
  }

  @Post('messages/:id/reveal')
  @HttpCode(HttpStatus.OK)
  @PrivateRead('message_body')
  @ApiOperation({
    summary:
      'Reveal ONE message text: reason code + text + a fresh authenticator code',
  })
  @ApiEnvelopeResponse(RevealedMessageDto)
  @ApiErrors(REVEAL_ERRORS)
  revealMessage(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: MessageIdParamDto,
  ): Promise<RevealedMessageDto> {
    return this.service.revealMessage(admin, params.id);
  }

  @Get('conversations/:id/calls')
  @PrivateRead('call_metadata')
  @ApiOperation({ summary: 'Call metadata of one conversation (audited)' })
  @ApiEnvelopeResponse(PrivateCallsDto)
  @ApiErrors({ ...READ_ERRORS, 503: [E.AUDIT_UNAVAILABLE] })
  listCalls(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: ConversationIdParamDto,
  ): Promise<PrivateCallsDto> {
    return this.service.listCalls(admin, params.id);
  }

  @Get('cases/:id/files')
  @PrivateRead('case_files')
  @ApiOperation({ summary: 'Files of one case, metadata only (audited)' })
  @ApiEnvelopeResponse(PrivateCaseFilesDto)
  @ApiErrors({ ...READ_ERRORS, 503: [E.AUDIT_UNAVAILABLE] })
  listCaseFiles(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: CaseIdParamDto,
  ): Promise<PrivateCaseFilesDto> {
    return this.service.listCaseFiles(admin, params.id);
  }

  @Post('cases/:id/files/:fileId/url')
  @HttpCode(HttpStatus.OK)
  @PrivateRead('private_document')
  @ApiOperation({
    summary:
      'Short-lived link to one case file: reason code + text + a fresh authenticator code',
  })
  @ApiEnvelopeResponse(PrivateFileUrlDto)
  @ApiErrors(REVEAL_ERRORS)
  caseFileUrl(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: CaseFileParamDto,
  ): Promise<PrivateFileUrlDto> {
    return this.service.caseFileUrl(admin, params.id, params.fileId);
  }
}
