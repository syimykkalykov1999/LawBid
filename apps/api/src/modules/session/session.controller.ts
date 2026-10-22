import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { notModified } from '../../common/sync/cheap-etag';
import { AssistantSelf } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { AppSessionDto } from './session.dto';
import { SessionService, type SessionView } from './session.service';

/**
 * Owner 2026-10-22 (client economy plan, package G): one request at app
 * start. Optional for older apps — /users/me, /badges and
 * /config/bootstrap stay as they are.
 */
@ApiTags('users')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AssistantSelf()
@Controller('me')
export class SessionController {
  constructor(private readonly session: SessionService) {}

  @Get('session')
  @ApiOperation({
    summary:
      'App start in one answer: me + badges + flags + config version + support unread + ongoing calls (cheap ETag → 304)',
  })
  @ApiEnvelopeResponse(AppSessionDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  async getSession(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionView | undefined> {
    if (notModified(req, res, await this.session.etag(user))) return undefined;
    return this.session.build(user);
  }
}
