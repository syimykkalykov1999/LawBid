import { Controller, Get, Query } from '@nestjs/common';
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
  CallHistoryItemDto,
  CallHistoryQueryDto,
  type CallHistoryPage,
  OngoingGroupCallDto,
} from './call-history.dto';
import { CallHistoryService } from './call-history.service';

/** Owner 2026-10-21: the «Calls» tab (WhatsApp style): history + the group
 * calls running now. Read only. */
@ApiTags('calls')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@RequiresDuty('calls')
@Controller('calls')
export class CallHistoryController {
  constructor(private readonly history: CallHistoryService) {}

  // Declared before `calls/:id` (CallsController) matters not: these paths
  // are fixed words, but the route order is kept explicit by the module.
  @Get('history')
  @ApiOperation({ summary: 'My finished calls, newest first (cursor)' })
  @ApiEnvelopeResponse(CallHistoryItemDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  callHistory(
    @CurrentUser() user: RequestUser,
    @Query() q: CallHistoryQueryDto,
  ): Promise<CallHistoryPage> {
    return this.history.history(user, q.cursor, q.limit);
  }

  @Get('ongoing')
  @ApiOperation({ summary: 'Group calls running now in my groups' })
  @ApiEnvelopeResponse(OngoingGroupCallDto, { isArray: true })
  ongoingGroupCalls(@CurrentUser() user: RequestUser): Promise<OngoingGroupCallDto[]> {
    return this.history.ongoing(user);
  }
}
