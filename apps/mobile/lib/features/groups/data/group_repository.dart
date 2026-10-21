import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: group chats and polls. A thin layer over the generated
/// `GroupsClient`: every call goes through [guardApiCall] (so a failure is
/// an `ApiException`) and returns the generated DTO unwrapped from its
/// envelope. Files (avatar, attachments) are uploaded by the existing
/// chat / avatar repositories; this one only takes the resulting file id.
class GroupRepository {
  GroupRepository(Dio dio) : _c = api.GroupsClient(dio);

  final api.GroupsClient _c;

  // --- lists and lookup -----------------------------------------------------

  /// [archived] = my archived groups (owner 2026-10-20); otherwise the
  /// archive is left out.
  Future<CursorPage<api.GroupDto>> groups({
    String? cursor,
    bool archived = false,
  }) async {
    final env = await guardApiCall(
      () => _c.listGroups(cursor: cursor, archived: archived ? true : null),
    );
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }

  Future<api.GroupDetailDto> group(String id) async =>
      (await guardApiCall(() => _c.getGroup(id: id))).data;

  /// «Find groups»: public groups by title or @username.
  Future<List<api.GroupInvitePreviewDto>> searchPublic(String q) async =>
      (await guardApiCall(() => _c.searchPublicGroups(q: q))).data;

  /// «Recommended» public groups for me, ranked on the server (cached).
  Future<CursorPage<api.GroupInvitePreviewDto>> discover({
    String? cursor,
  }) async {
    final env = await guardApiCall(() => _c.discoverGroups(cursor: cursor));
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }

  /// The group behind an invite link code (or a public @username).
  Future<api.GroupInvitePreviewDto> preview(String code) async =>
      (await guardApiCall(() => _c.previewGroupInvite(code: code))).data;

  /// Join (open group / link), or send a request (closed with approval).
  Future<api.GroupJoinResultDto> join(String code) async =>
      (await guardApiCall(() => _c.joinGroup(code: code))).data;

  // --- invitations (owner 2026-10-21) ---------------------------------------

  /// Invitations waiting for my answer (the cards in Requests).
  Future<List<api.GroupInviteDto>> invites() async =>
      (await guardApiCall(_c.listMyGroupInvitations)).data;

  /// Look inside the group behind an invitation before answering.
  Future<api.GroupInvitePreviewDetailDto> invitePreview(String id) async =>
      (await guardApiCall(() => _c.previewGroupInvitation(inviteId: id))).data;

  Future<api.GroupJoinResultDto> acceptInvite(String id) async =>
      (await guardApiCall(() => _c.acceptGroupInvitation(inviteId: id))).data;

  Future<void> declineInvite(String id) =>
      guardApiCall(() => _c.declineGroupInvitation(inviteId: id));

  // --- group management -----------------------------------------------------

  Future<api.GroupDetailDto> create(api.CreateGroupDto body) async =>
      (await guardApiCall(() => _c.createGroup(body: body))).data;

  Future<api.GroupDetailDto> update(String id, api.UpdateGroupDto body) async =>
      (await guardApiCall(() => _c.updateGroup(id: id, body: body))).data;

  Future<void> deleteGroup(String id) =>
      guardApiCall(() => _c.deleteGroupChat(id: id));

  Future<void> leave(String id) => guardApiCall(() => _c.leaveGroup(id: id));

  Future<api.GroupDetailDto> resetInvite(String id) async =>
      (await guardApiCall(() => _c.resetGroupInvite(id: id))).data;

  Future<api.GroupDetailDto> addMembers(
    String id,
    List<String> userIds,
  ) async =>
      (await guardApiCall(
        () => _c.addGroupMembers(
          id: id,
          body: api.AddGroupMembersDto(userIds: userIds),
        ),
      ))
          .data;

  Future<api.GroupDetailDto> removeMember(String id, String userId) async =>
      (await guardApiCall(() => _c.removeGroupMember(id: id, userId: userId)))
          .data;

  Future<api.GroupDetailDto> setRole(
    String id,
    String userId,
    api.SetGroupRoleDtoRole role, {
    List<String>? rights,
  }) async =>
      (await guardApiCall(
        () => _c.setGroupMemberRole(
          id: id,
          userId: userId,
          body: api.SetGroupRoleDto(
            role: role,
            rights: rights == null
                ? null
                : [
                    for (final r in rights)
                      api.SetGroupRoleDtoRights.fromJson(r),
                  ],
          ),
        ),
      ))
          .data;

  Future<api.GroupDetailDto> transferOwner(String id, String userId) async =>
      (await guardApiCall(
        () => _c.transferGroupOwner(
          id: id,
          body: api.TransferGroupDto(userId: userId),
        ),
      ))
          .data;

  /// My own mute / pin / hide of this chat.
  Future<api.GroupDto> updateMine(String id, api.UpdateGroupMeDto body) async =>
      (await guardApiCall(() => _c.updateMyGroupSettings(id: id, body: body)))
          .data;

  // --- join requests --------------------------------------------------------

  Future<List<api.GroupJoinRequestDto>> requests(String id) async =>
      (await guardApiCall(() => _c.listGroupJoinRequests(id: id))).data;

  Future<List<api.GroupJoinRequestDto>> answerRequest(
    String id,
    String userId, {
    required bool approve,
  }) async =>
      (await guardApiCall(
        () => approve
            ? _c.approveGroupJoinRequest(id: id, userId: userId)
            : _c.declineGroupJoinRequest(id: id, userId: userId),
      ))
          .data;

  // --- messages -------------------------------------------------------------

  Future<CursorPage<api.GroupMessageDto>> messages(
    String id, {
    String? topicId,
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _c.listGroupMessages(id: id, topicId: topicId, cursor: cursor),
    );
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }

  /// Owner 2026-10-21: one tab of the group's shared media, newest first.
  Future<CursorPage<api.GroupMessageDto>> shared(
    String id,
    api.GroupSharedKind kind, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _c.listShared(id: id, kind: kind, cursor: cursor),
    );
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }

  Future<api.GroupMessageDto> send(
    String id,
    api.SendGroupMessageDto body,
  ) async =>
      (await guardApiCall(() => _c.sendGroupMessage(id: id, body: body))).data;

  Future<api.GroupMessageDto> edit(
    String id,
    String messageId,
    String body,
  ) async =>
      (await guardApiCall(
        () => _c.editGroupMessage(
          id: id,
          messageId: messageId,
          body: api.EditGroupMessageDto(body: body),
        ),
      ))
          .data;

  Future<void> deleteMessage(String id, String messageId) =>
      guardApiCall(() => _c.deleteGroupMessage(id: id, messageId: messageId));

  /// Pin a message (admins); a null [messageId] unpins.
  Future<api.GroupDetailDto> pin(String id, String? messageId) async =>
      (await guardApiCall(
        () => _c.pinGroupMessage(
          id: id,
          body: api.PinGroupMessageDto(messageId: messageId),
        ),
      ))
          .data;

  Future<void> read(String id, String lastReadMessageId) => guardApiCall(
        () => _c.readGroup(
          id: id,
          body: api.ReadGroupDto(lastReadMessageId: lastReadMessageId),
        ),
      );

  // --- topics ---------------------------------------------------------------

  Future<List<api.GroupTopicDto>> topics(String id) async =>
      (await guardApiCall(() => _c.listGroupTopics(id: id))).data;

  Future<api.GroupTopicDto> createTopic(
    String id,
    api.CreateTopicDto body,
  ) async =>
      (await guardApiCall(() => _c.createGroupTopic(id: id, body: body))).data;

  Future<List<api.GroupTopicDto>> updateTopic(
    String id,
    String topicId,
    api.UpdateTopicDto body,
  ) async =>
      (await guardApiCall(
        () => _c.updateGroupTopic(id: id, topicId: topicId, body: body),
      ))
          .data;

  // --- polls ----------------------------------------------------------------

  Future<api.GroupMessageDto> createPoll(
    String id,
    api.CreatePollDto body,
  ) async =>
      (await guardApiCall(() => _c.createGroupPoll(id: id, body: body))).data;

  /// Vote or revote; an empty list retracts.
  Future<api.PollDto> vote(
    String id,
    String pollId,
    List<String> optionIds,
  ) async =>
      (await guardApiCall(
        () => _c.voteGroupPoll(
          id: id,
          pollId: pollId,
          body: api.VotePollDto(optionIds: optionIds),
        ),
      ))
          .data;

  Future<api.PollDto> closePoll(String id, String pollId) async =>
      (await guardApiCall(() => _c.closeGroupPoll(id: id, pollId: pollId)))
          .data;

  /// Who voted for what (open polls only).
  Future<List<api.PollVoterOptionDto>> voters(String id, String pollId) async =>
      (await guardApiCall(() => _c.listGroupPollVoters(id: id, pollId: pollId)))
          .data;
}
