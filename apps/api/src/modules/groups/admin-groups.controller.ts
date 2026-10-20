import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import {
  AdminGroupDetailDto,
  AdminGroupDto,
  AdminGroupIdParamDto,
  AdminGroupMemberParamDto,
  AdminGroupsQueryDto,
  type AdminGroupPage,
} from './admin-groups.dto';
import { AdminGroupsService } from './admin-groups.service';

/** Owner 2026-10-20: Модерация → «Группы»: find a group, remove a member,
 * close the group. Every action is audited (the auto-audit row). */
@ApiTags('admin-group-chats')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/group-chats')
export class AdminGroupsController {
  constructor(private readonly groups: AdminGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Group chats, newest first' })
  @ApiEnvelopeResponse(AdminGroupDto, { isArray: true })
  adminListGroupChats(
    @Query() q: AdminGroupsQueryDto,
  ): Promise<AdminGroupPage> {
    return this.groups.list(q.q, q.cursor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One group with its members' })
  @ApiEnvelopeResponse(AdminGroupDetailDto)
  @ApiErrors({ 404: [ErrorCode.GROUP_NOT_FOUND] })
  adminGetGroupChat(
    @Param() p: AdminGroupIdParamDto,
  ): Promise<AdminGroupDetailDto> {
    return this.groups.get(p.id);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the group' })
  @ApiErrors({ 404: [ErrorCode.GROUP_NOT_FOUND] })
  adminRemoveGroupChatMember(
    @Param() p: AdminGroupMemberParamDto,
  ): Promise<void> {
    return this.groups.removeMember(p.id, p.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close the group for everyone' })
  @ApiErrors({ 404: [ErrorCode.GROUP_NOT_FOUND] })
  adminDeleteGroupChat(@Param() p: AdminGroupIdParamDto): Promise<void> {
    return this.groups.deleteGroup(p.id);
  }
}
