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
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GroupPollsService } from './group-polls.service';
import {
  AddGroupMembersDto,
  CreateGroupDto,
  CreatePollDto,
  EditGroupMessageDto,
  GroupDetailDto,
  GroupDto,
  GroupJoinRequestDto,
  GroupJoinResultDto,
  GroupRequestParamDto,
  GroupTopicDto,
  GroupTopicParamDto,
  CreateTopicDto,
  UpdateTopicDto,
  SearchGroupsQueryDto,
  GroupIdParamDto,
  GroupInviteCodeParamDto,
  GroupInvitePreviewDto,
  GroupMemberParamDto,
  GroupMessageDto,
  GroupMessageParamDto,
  GroupMessagesQueryDto,
  GroupPollParamDto,
  GroupReadResultDto,
  GroupsQueryDto,
  PinGroupMessageDto,
  PollDto,
  PollVoterOptionDto,
  ReadGroupDto,
  SendGroupMessageDto,
  SetGroupRoleDto,
  UpdateGroupDto,
  UpdateGroupMeDto,
  VotePollDto,
  type GroupMessagePage,
  type GroupPage,
} from './groups.dto';
import { GroupsService } from './groups.service';

const GROUP_ERRORS = {
  403: [ErrorCode.GROUP_FORBIDDEN],
  404: [ErrorCode.GROUP_NOT_FOUND],
};

/** Owner 2026-10-20: group chats and polls (Telegram + WhatsApp). */
@ApiTags('groups')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly polls: GroupPollsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My groups, newest first (pinned lead page 1)' })
  @ApiEnvelopeResponse(GroupDto, { isArray: true })
  listGroups(
    @CurrentUser() user: RequestUser,
    @Query() q: GroupsQueryDto,
  ): Promise<GroupPage> {
    return this.groups.list(user, q.cursor);
  }

  @Post()
  @ApiOperation({ summary: 'Create a group with the people picked' })
  @ApiEnvelopeResponse(GroupDetailDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  createGroup(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateGroupDto,
  ): Promise<GroupDetailDto> {
    return this.groups.create(user, dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Find public groups by title or @username' })
  @ApiEnvelopeResponse(GroupInvitePreviewDto, { isArray: true })
  searchPublicGroups(
    @CurrentUser() user: RequestUser,
    @Query() q: SearchGroupsQueryDto,
  ): Promise<GroupInvitePreviewDto[]> {
    return this.groups.searchPublic(user, q.q);
  }

  @Get('join/:code')
  @ApiOperation({ summary: 'Preview a group by its invite link code' })
  @ApiEnvelopeResponse(GroupInvitePreviewDto)
  @ApiErrors({ 404: [ErrorCode.GROUP_NOT_FOUND] })
  previewGroupInvite(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupInviteCodeParamDto,
  ): Promise<GroupInvitePreviewDto> {
    return this.groups.previewInvite(user, p.code);
  }

  @Post('join/:code')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Join through the invite link / @username; a closed group with approval answers pending',
  })
  @ApiEnvelopeResponse(GroupJoinResultDto)
  @ApiErrors({
    403: [ErrorCode.GROUP_FORBIDDEN],
    404: [ErrorCode.GROUP_NOT_FOUND],
    409: [ErrorCode.GROUP_FULL],
  })
  joinGroup(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupInviteCodeParamDto,
  ): Promise<GroupJoinResultDto> {
    return this.groups.join(user, p.code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One group with its members' })
  @ApiEnvelopeResponse(GroupDetailDto)
  @ApiErrors(GROUP_ERRORS)
  getGroup(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
  ): Promise<GroupDetailDto> {
    return this.groups.get(user, p.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Title / photo / description (who may edit info) and rules / link (admins)',
  })
  @ApiEnvelopeResponse(GroupDetailDto)
  @ApiErrors(GROUP_ERRORS)
  updateGroup(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: UpdateGroupDto,
  ): Promise<GroupDetailDto> {
    return this.groups.update(user, p.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete the group (owner)' })
  @ApiErrors(GROUP_ERRORS)
  async deleteGroupChat(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
  ): Promise<void> {
    await this.groups.deleteGroup(user, p.id);
  }

  @Post(':id/invite/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'New join link (the old one stops working)' })
  @ApiEnvelopeResponse(GroupDetailDto)
  @ApiErrors(GROUP_ERRORS)
  resetGroupInvite(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
  ): Promise<GroupDetailDto> {
    return this.groups.resetInvite(user, p.id);
  }

  @Post(':id/members')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Add people (admins, or everyone if the rule says)',
  })
  @ApiEnvelopeResponse(GroupDetailDto)
  @ApiErrors({ ...GROUP_ERRORS, 409: [ErrorCode.GROUP_FULL] })
  addGroupMembers(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: AddGroupMembersDto,
  ): Promise<GroupDetailDto> {
    return this.groups.addMembers(user, p.id, dto);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member (admins)' })
  @ApiEnvelopeResponse(GroupDetailDto)
  @ApiErrors(GROUP_ERRORS)
  removeGroupMember(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupMemberParamDto,
  ): Promise<GroupDetailDto> {
    return this.groups.removeMember(user, p.id, p.userId);
  }

  @Put(':id/members/:userId/role')
  @ApiOperation({ summary: 'Make an admin / take admin rights away (owner)' })
  @ApiEnvelopeResponse(GroupDetailDto)
  @ApiErrors(GROUP_ERRORS)
  setGroupMemberRole(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupMemberParamDto,
    @Body() dto: SetGroupRoleDto,
  ): Promise<GroupDetailDto> {
    return this.groups.setRole(user, p.id, p.userId, dto.role);
  }

  @Post(':id/leave')
  @HttpCode(204)
  @ApiOperation({ summary: 'Leave the group' })
  @ApiErrors(GROUP_ERRORS)
  async leaveGroup(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
  ): Promise<void> {
    await this.groups.leave(user, p.id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Messages, newest first' })
  @ApiEnvelopeResponse(GroupMessageDto, { isArray: true })
  @ApiErrors(GROUP_ERRORS)
  listGroupMessages(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Query() q: GroupMessagesQueryDto,
  ): Promise<GroupMessagePage> {
    return this.groups.messages(user, p.id, q.cursor, q.limit, q.topicId);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Write to the group (idempotent on clientMessageId)',
  })
  @ApiEnvelopeResponse(GroupMessageDto)
  @ApiErrors({ ...GROUP_ERRORS, 409: [ErrorCode.FILE_NOT_ATTACHABLE] })
  sendGroupMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: SendGroupMessageDto,
  ): Promise<GroupMessageDto> {
    return this.groups.send(user, p.id, dto);
  }

  @Patch(':id/messages/:messageId')
  @ApiOperation({ summary: 'Edit my text message' })
  @ApiEnvelopeResponse(GroupMessageDto)
  @ApiErrors(GROUP_ERRORS)
  editGroupMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupMessageParamDto,
    @Body() dto: EditGroupMessageDto,
  ): Promise<GroupMessageDto> {
    return this.groups.edit(user, p.id, p.messageId, dto.body);
  }

  @Delete(':id/messages/:messageId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete for everyone (the author, or an admin)' })
  @ApiErrors(GROUP_ERRORS)
  async deleteGroupMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupMessageParamDto,
  ): Promise<void> {
    await this.groups.remove(user, p.id, p.messageId);
  }

  @Put(':id/pin')
  @ApiOperation({ summary: 'Pin a message (admins); messageId null unpins' })
  @ApiEnvelopeResponse(GroupDetailDto)
  @ApiErrors(GROUP_ERRORS)
  pinGroupMessage(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: PinGroupMessageDto,
  ): Promise<GroupDetailDto> {
    return this.groups.pin(user, p.id, dto.messageId);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark read up to a message' })
  @ApiEnvelopeResponse(GroupReadResultDto)
  @ApiErrors(GROUP_ERRORS)
  readGroup(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: ReadGroupDto,
  ): Promise<GroupReadResultDto> {
    return this.groups.read(user, p.id, dto.lastReadMessageId);
  }

  @Patch(':id/me')
  @ApiOperation({ summary: 'My mute / pin / hide of this chat' })
  @ApiEnvelopeResponse(GroupDto)
  @ApiErrors(GROUP_ERRORS)
  updateMyGroupSettings(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: UpdateGroupMeDto,
  ): Promise<GroupDto> {
    return this.groups.updateMe(user, p.id, dto);
  }

  // --------------------------------------------------------------- requests

  @Get(':id/requests')
  @ApiOperation({ summary: 'Join requests waiting for an admin' })
  @ApiEnvelopeResponse(GroupJoinRequestDto, { isArray: true })
  @ApiErrors(GROUP_ERRORS)
  listGroupJoinRequests(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
  ): Promise<GroupJoinRequestDto[]> {
    return this.groups.requests(user, p.id);
  }

  @Post(':id/requests/:userId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Let the person in (admins)' })
  @ApiEnvelopeResponse(GroupJoinRequestDto, { isArray: true })
  @ApiErrors(GROUP_ERRORS)
  approveGroupJoinRequest(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupRequestParamDto,
  ): Promise<GroupJoinRequestDto[]> {
    return this.groups.decideRequest(user, p.id, p.userId, true);
  }

  @Post(':id/requests/:userId/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Turn the request down (admins)' })
  @ApiEnvelopeResponse(GroupJoinRequestDto, { isArray: true })
  @ApiErrors(GROUP_ERRORS)
  declineGroupJoinRequest(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupRequestParamDto,
  ): Promise<GroupJoinRequestDto[]> {
    return this.groups.decideRequest(user, p.id, p.userId, false);
  }

  // ------------------------------------------------------------------ topics

  @Get(':id/topics')
  @ApiOperation({ summary: 'Topics of a forum group («General» first)' })
  @ApiEnvelopeResponse(GroupTopicDto, { isArray: true })
  @ApiErrors(GROUP_ERRORS)
  listGroupTopics(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
  ): Promise<GroupTopicDto[]> {
    return this.groups.topics(user, p.id);
  }

  @Post(':id/topics')
  @ApiOperation({ summary: 'Create a topic (admins)' })
  @ApiEnvelopeResponse(GroupTopicDto)
  @ApiErrors({ ...GROUP_ERRORS, 400: [ErrorCode.VALIDATION_ERROR] })
  createGroupTopic(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: CreateTopicDto,
  ): Promise<GroupTopicDto> {
    return this.groups.createTopic(user, p.id, dto);
  }

  @Patch(':id/topics/:topicId')
  @ApiOperation({ summary: 'Rename / recolor / close / pin a topic (admins)' })
  @ApiEnvelopeResponse(GroupTopicDto, { isArray: true })
  @ApiErrors(GROUP_ERRORS)
  updateGroupTopic(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupTopicParamDto,
    @Body() dto: UpdateTopicDto,
  ): Promise<GroupTopicDto[]> {
    return this.groups.updateTopic(user, p.id, p.topicId, dto);
  }

  // ------------------------------------------------------------------ polls

  @Post(':id/polls')
  @ApiOperation({ summary: 'Create a poll (a message of type poll)' })
  @ApiEnvelopeResponse(GroupMessageDto)
  @ApiErrors({ ...GROUP_ERRORS, 400: [ErrorCode.VALIDATION_ERROR] })
  createGroupPoll(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: CreatePollDto,
  ): Promise<GroupMessageDto> {
    return this.polls.create(user, p.id, dto);
  }

  @Put(':id/polls/:pollId/vote')
  @ApiOperation({ summary: 'Vote / revote; an empty list retracts' })
  @ApiEnvelopeResponse(PollDto)
  @ApiErrors({
    ...GROUP_ERRORS,
    400: [ErrorCode.VALIDATION_ERROR],
    409: [ErrorCode.POLL_CLOSED],
  })
  voteGroupPoll(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupPollParamDto,
    @Body() dto: VotePollDto,
  ): Promise<PollDto> {
    return this.polls.vote(user, p.id, p.pollId, dto.optionIds);
  }

  @Post(':id/polls/:pollId/close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Close a poll (its author, or an admin)' })
  @ApiEnvelopeResponse(PollDto)
  @ApiErrors(GROUP_ERRORS)
  closeGroupPoll(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupPollParamDto,
  ): Promise<PollDto> {
    return this.polls.close(user, p.id, p.pollId);
  }

  @Get(':id/polls/:pollId/voters')
  @ApiOperation({ summary: 'Who voted for what (open polls only)' })
  @ApiEnvelopeResponse(PollVoterOptionDto, { isArray: true })
  @ApiErrors(GROUP_ERRORS)
  listGroupPollVoters(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupPollParamDto,
  ): Promise<PollVoterOptionDto[]> {
    return this.polls.voters(user, p.id, p.pollId);
  }
}
