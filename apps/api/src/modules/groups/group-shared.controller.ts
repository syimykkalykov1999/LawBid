import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiresDuty } from '../auth/assistant/assistant-context';
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
import { GroupSharedQueryDto } from './group-shared.dto';
import { GroupSharedService } from './group-shared.service';
import { GroupIdParamDto, GroupMessageDto } from './groups.dto';
import type { GroupMessagePage } from './groups.dto';

/** Owner 2026-10-21: the «Photos and videos · Files · Links · Voice» tabs. */
@ApiTags('groups')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
// Owner 2026-10-22 (security audit #3): the same "chats" duty as the group.
@RequiresDuty('chats')
@Controller('groups')
export class GroupSharedController {
  constructor(private readonly shared: GroupSharedService) {}

  @Get(':id/shared')
  @ApiOperation({ summary: 'Shared media of the group, newest first' })
  @ApiEnvelopeResponse(GroupMessageDto, { isArray: true })
  @ApiErrors({
    403: [ErrorCode.GROUP_FORBIDDEN],
    404: [ErrorCode.GROUP_NOT_FOUND],
  })
  listShared(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Query() q: GroupSharedQueryDto,
  ): Promise<GroupMessagePage> {
    return this.shared.list(user, p.id, q.kind, q.cursor, q.limit);
  }
}
