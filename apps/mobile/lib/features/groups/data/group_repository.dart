import 'dart:async';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart' show SyncedPage;
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_service.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: group chats and polls. A thin layer over the generated
/// `GroupsClient`: every call goes through [guardApiCall] (so a failure is
/// an `ApiException`) and returns the generated DTO unwrapped from its
/// envelope. Files (avatar, attachments) are uploaded by the existing
/// chat / avatar repositories; this one only takes the resulting file id.
class GroupRepository {
  GroupRepository(Dio dio, {this.noteMedia, this.e2ee})
      : _c = api.GroupsClient(dio),
        _dio = dio;

  final api.GroupsClient _c;
  final Dio _dio;

  /// G2: the account's end-to-end encryption of groups (null signed out /
  /// in tests). Message rows pass through it as JSON: an `mls` row is
  /// opened before it becomes a `GroupMessageDto`, a send in an encrypted
  /// group goes sealed.
  final GroupE2eeService? Function()? e2ee;

  GroupE2eeService? get _e2ee => e2ee?.call();

  /// The rows of a messages answer, opened ([GroupE2eeService.openAll]).
  Future<(List<api.GroupMessageDto>, String?)> _rows(
    String id,
    Response<Object?> r,
  ) async {
    final body = r.data;
    if (body is! Map) {
      throw const ApiException(
        code: ApiException.networkErrorCode,
        message: 'Unexpected response shape from the server.',
      );
    }
    final rows = [
      for (final m in (body['data'] as List?) ?? const [])
        Map<String, dynamic>.from(m as Map),
    ];
    final opened = await _e2ee!.openAll(id, rows);
    final meta = body['meta'];
    return (
      [for (final m in opened) api.GroupMessageDto.fromJson(m)],
      meta is Map ? meta['nextCursor'] as String? : null,
    );
  }

  Future<api.GroupMessageDto> _one(String id, Response<Object?> r) async {
    final body = r.data;
    final row = Map<String, dynamic>.from(
      (body is Map ? body['data'] : null) as Map,
    );
    final opened = await _e2ee!.open(id, row);
    return api.GroupMessageDto.fromJson(opened ?? row);
  }

  /// A refused send for the group's encryption state: the state is stale.
  Future<T> _sealedCall<T>(String id, Future<T> Function() call) async {
    try {
      return await guardApiCall(call);
    } on ApiException catch (e) {
      if (e.statusCode == 409 && e.code.startsWith('E2EE_')) {
        _e2ee?.invalidate(id);
      }
      rethrow;
    }
  }

  /// Owner 2026-11-03: told which pictures a group's messages carry (cache
  /// keys), so «Данные и память» can age them out by the groups' rule.
  final void Function(String groupId, Iterable<String> imageUrls)? noteMedia;

  void _noteImages(String id, Iterable<api.GroupMessageDto> messages) {
    final note = noteMedia;
    if (note == null) return;
    note(id, [
      for (final m in messages)
        if (m.attachment?.isImage ?? false)
          for (final u in [m.attachment!.url, m.attachment!.previewUrl])
            if (u != null) u,
    ]);
  }

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

  /// Owner 2026-10-22 (client economy plan, package B): only the groups
  /// changed since [since] (server time) plus the ids that left the list.
  Future<SyncedPage<api.GroupDto>> groupsChangedSince(
    DateTime since, {
    bool archived = false,
  }) async {
    final env = await guardApiCall(
      () => _c.listGroups(
        updatedSince: since.toUtc(),
        archived: archived ? true : null,
      ),
    );
    return SyncedPage(
      items: env.data,
      deletedIds: env.meta?.deletedIds ?? const [],
      syncedAt: env.meta?.syncedAt,
    );
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
      _joined((await guardApiCall(() => _c.joinGroup(code: code))).data);

  /// G2 §4.2: in by link / invite — this device joins the group's
  /// encryption itself (external commit), nobody has to be online.
  api.GroupJoinResultDto _joined(api.GroupJoinResultDto r) {
    if (r.group != null) _e2ee?.onServerEvent(r.groupId);
    return r;
  }

  // --- invitations (owner 2026-10-21) ---------------------------------------

  /// Invitations waiting for my answer (the cards in Requests).
  Future<List<api.GroupInviteDto>> invites() async =>
      (await guardApiCall(_c.listMyGroupInvitations)).data;

  /// Look inside the group behind an invitation before answering.
  Future<api.GroupInvitePreviewDetailDto> invitePreview(String id) async =>
      (await guardApiCall(() => _c.previewGroupInvitation(inviteId: id))).data;

  Future<api.GroupJoinResultDto> acceptInvite(String id) async => _joined(
        (await guardApiCall(() => _c.acceptGroupInvitation(inviteId: id)))
            .data,
      );

  Future<void> declineInvite(String id) =>
      guardApiCall(() => _c.declineGroupInvitation(inviteId: id));

  // --- group management -----------------------------------------------------

  Future<api.GroupDetailDto> create(api.CreateGroupDto body) async =>
      (await guardApiCall(() => _c.createGroup(body: body))).data;

  Future<api.GroupDetailDto> update(String id, api.UpdateGroupDto body) async =>
      (await guardApiCall(() => _c.updateGroup(id: id, body: body))).data;

  Future<void> deleteGroup(String id) =>
      guardApiCall(() => _c.deleteGroupChat(id: id));

  Future<void> leave(String id) async {
    await guardApiCall(() => _c.leaveGroup(id: id));
    // G2: out of the group — its MLS state goes from this device.
    await _e2ee?.left(id);
  }

  Future<api.GroupDetailDto> resetInvite(String id) async =>
      (await guardApiCall(() => _c.resetGroupInvite(id: id))).data;

  Future<api.GroupDetailDto> addMembers(
    String id,
    List<String> userIds,
  ) async {
    final d = (await guardApiCall(
      () => _c.addGroupMembers(
        id: id,
        body: api.AddGroupMembersDto(userIds: userIds),
      ),
    ))
        .data;
    // G2 §4.2: the one who added them adds their devices (one commit, one
    // Welcome), so they read from the moment they are in.
    unawaited(_e2ee?.addPeople(id, userIds));
    return d;
  }

  Future<api.GroupDetailDto> removeMember(String id, String userId) async {
    final d = (await guardApiCall(
      () => _c.removeGroupMember(id: id, userId: userId),
    ))
        .data;
    // G2 §4.2: the one who removed commits the removal (under the lease);
    // otherwise the next device that writes does.
    _e2ee?.onServerEvent(id);
    return d;
  }

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

  /// Sweep B-c1: the members after [cursor] (the card carries the first
  /// 100 and `membersNextCursor`), owner, admins, then by join time.
  Future<CursorPage<api.GroupMemberDto>> members(
    String id, {
    required String cursor,
  }) async {
    final env = await guardApiCall(
      () => _c.listGroupMembers(id: id, cursor: cursor),
    );
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }

  /// Row 110 (Telegram «Search members»): the members whose name or
  /// @username matches [q] (one page, any alphabet).
  Future<List<api.GroupMemberDto>> searchMembers(String id, String q) async {
    final env = await guardApiCall(
      () => _c.listGroupMembers(id: id, q: q.trim()),
    );
    return env.data;
  }

  // --- messages -------------------------------------------------------------

  Future<CursorPage<api.GroupMessageDto>> messages(
    String id, {
    String? topicId,
    String? cursor,
  }) async {
    if (_e2ee != null) {
      final (items, next) = await guardApiCall(
        () async => _rows(
          id,
          await _dio.get<Object?>(
            '/groups/$id/messages',
            queryParameters: {
              if (topicId != null) 'topicId': topicId,
              if (cursor != null) 'cursor': cursor,
            },
          ),
        ),
      );
      _noteImages(id, items);
      return CursorPage(items: items, nextCursor: next);
    }
    final env = await guardApiCall(
      () => _c.listGroupMessages(id: id, topicId: topicId, cursor: cursor),
    );
    _noteImages(id, env.data);
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }

  /// Row 110 (Telegram 🔍 in a chat): the text messages holding every word
  /// of [q], newest first, a page at a time.
  Future<CursorPage<api.GroupMessageDto>> searchMessages(
    String id,
    String q, {
    String? topicId,
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _c.listGroupMessages(
        id: id,
        topicId: topicId,
        cursor: cursor,
        q: q.trim(),
      ),
    );
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }

  /// Package B: everything after [afterId] (oldest first, up to 200; more
  /// → `409 SYNC_TOO_OLD`, the caller reloads the page).
  Future<List<api.GroupMessageDto>> messagesAfter(
    String id,
    String afterId, {
    String? topicId,
  }) async {
    if (_e2ee != null) {
      final (items, _) = await guardApiCall(
        () async => _rows(
          id,
          await _dio.get<Object?>(
            '/groups/$id/messages',
            queryParameters: {
              if (topicId != null) 'topicId': topicId,
              'afterId': afterId,
            },
          ),
        ),
      );
      _noteImages(id, items);
      return items;
    }
    final data = (await guardApiCall(
      () => _c.listGroupMessages(id: id, topicId: topicId, afterId: afterId),
    ))
        .data;
    _noteImages(id, data);
    return data;
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
  ) async {
    final e2ee = _e2ee;
    // G2: a text of an encrypted group goes sealed (the reply and mentions
    // stay open routing metadata, the words inside MLS). Files and voice
    // notes come with G3.
    if (e2ee != null && body.type == api.SendGroupMessageDtoType.text) {
      return _sealedCall(id, () async {
        final sealed = await e2ee.sealSend(
          id,
          body.clientMessageId,
          E2eePayload(
            kind: 'text',
            body: body.body ?? '',
            replyToId: body.replyToId,
          ),
          topicId: body.topicId,
          mentionIds: body.mentionIds,
        );
        if (sealed == null) {
          return (await _c.sendGroupMessage(id: id, body: body)).data;
        }
        return _one(
          id,
          await _dio.post<Object?>('/groups/$id/messages', data: sealed),
        );
      });
    }
    return _sealedCall(
      id,
      () async => (await _c.sendGroupMessage(id: id, body: body)).data,
    );
  }

  /// G2: a control message (edit, reaction, vote, close) of an encrypted
  /// group, sealed and sent; false when the group is not encrypted.
  Future<bool> _control(
    String id,
    String kind,
    String targetId, {
    String body = '',
    Map<String, Object?> extra = const {},
  }) async {
    final e2ee = _e2ee;
    if (e2ee == null || !await e2ee.seals(id)) return false;
    return _sealedCall(id, () async {
      final sealed = await e2ee.sealControl(
        id,
        'g${DateTime.now().microsecondsSinceEpoch}-$kind',
        kind,
        targetId,
        body: body,
        extra: extra,
      );
      if (sealed == null) return false;
      await _dio.post<Object?>('/groups/$id/messages', data: sealed);
      return true;
    });
  }

  /// Groups WhatsApp parity («Данные»): who has read my message.
  Future<api.GroupMessageReadersDto> readers(
    String id,
    String messageId,
  ) async =>
      (await guardApiCall(
        () => _c.groupMessageReaders(id: id, messageId: messageId),
      ))
          .data;

  /// Groups WhatsApp parity: one emoji of mine on a message (the 1:1
  /// chat's PUT …/reaction); null takes it away.
  Future<api.GroupMessageDto> react(
    String id,
    String messageId,
    String? emoji, {
    api.GroupMessageDto? current,
  }) async {
    final e2ee = _e2ee;
    if (current != null && e2ee != null && e2ee.isSealedRow(messageId)) {
      // G2: the reaction is inside MLS; the server never learns the emoji.
      await _control(id, GroupControl.react, messageId, body: emoji ?? '');
      return api.GroupMessageDto.fromJson(
        (await e2ee.refresh(id, [current.toJson()])).single,
      );
    }
    return _reactOpen(id, messageId, emoji);
  }

  Future<api.GroupMessageDto> _reactOpen(
    String id,
    String messageId,
    String? emoji,
  ) async =>
      (await guardApiCall(
        () => _c.reactToGroupMessage(
          id: id,
          messageId: messageId,
          body: api.ReactMessageDto(emoji: emoji),
        ),
      ))
          .data;

  Future<api.GroupMessageDto> edit(
    String id,
    String messageId,
    String body, {
    api.GroupMessageDto? current,
  }) async {
    final e2ee = _e2ee;
    if (current != null && e2ee != null && e2ee.isSealedRow(messageId)) {
      // G2: the new text is a sealed `edit` of the message; the server
      // only marks it edited.
      await _control(id, GroupControl.edit, messageId, body: body);
      final shown = (await e2ee.refresh(id, [current.toJson()])).single;
      return api.GroupMessageDto.fromJson({
        ...shown,
        'editedAt': DateTime.now().toUtc().toIso8601String(),
      });
    }
    return _editOpen(id, messageId, body);
  }

  Future<api.GroupMessageDto> _editOpen(
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

  Future<void> deleteMessage(String id, String messageId) async {
    await guardApiCall(
      () => _c.deleteGroupMessage(id: id, messageId: messageId),
    );
    // G2: the server wiped the ciphertext; this device's copy goes too.
    await _e2ee?.forget(messageId);
  }

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

  /// Package B: only the topics changed since [since].
  Future<SyncedPage<api.GroupTopicDto>> topicsChangedSince(
    String id,
    DateTime since,
  ) async {
    final env = await guardApiCall(
      () => _c.listGroupTopics(id: id, updatedSince: since.toUtc()),
    );
    return SyncedPage(items: env.data, syncedAt: env.meta?.syncedAt);
  }

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
  ) async {
    final e2ee = _e2ee;
    if (e2ee != null) {
      return _sealedCall(id, () async {
        // G2 (WhatsApp): question and options inside MLS, the votes are
        // counted on the phones; the server keeps no poll rows.
        final sealed = await e2ee.sealSend(
          id,
          body.clientMessageId,
          E2eePayload(
            kind: 'poll',
            body: body.question,
            extra: {
              'opts': [
                for (var i = 0; i < body.options.length; i++)
                  {'id': 'o$i', 'text': body.options[i]},
              ],
              if (body.multiple) 'multi': true,
              if (body.anonymous) 'anon': true,
            },
          ),
          topicId: body.topicId,
        );
        if (sealed == null) {
          return (await _c.createGroupPoll(id: id, body: body)).data;
        }
        return _one(
          id,
          await _dio.post<Object?>('/groups/$id/messages', data: sealed),
        );
      });
    }
    return (await guardApiCall(() => _c.createGroupPoll(id: id, body: body)))
        .data;
  }

  /// G2: the local view of an encrypted group's poll (null: not one).
  Future<api.PollDto?> _sealedPoll(String pollId) async {
    final e2ee = _e2ee;
    if (e2ee == null || !e2ee.isSealedRow(pollId)) return null;
    final p = await e2ee.pollOf(pollId);
    return p == null ? null : api.PollDto.fromJson(p);
  }

  /// Vote or revote; an empty list retracts.
  Future<api.PollDto> vote(
    String id,
    String pollId,
    List<String> optionIds,
  ) async {
    if (await _sealedPoll(pollId) != null) {
      await _control(id, GroupControl.vote, pollId, extra: {'o': optionIds});
      return (await _sealedPoll(pollId))!;
    }
    return _voteOpen(id, pollId, optionIds);
  }

  Future<api.PollDto> _voteOpen(
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

  Future<api.PollDto> closePoll(String id, String pollId) async {
    if (await _sealedPoll(pollId) != null) {
      await _control(id, GroupControl.close, pollId);
      return (await _sealedPoll(pollId))!;
    }
    return (await guardApiCall(() => _c.closeGroupPoll(id: id, pollId: pollId)))
        .data;
  }

  /// Who voted for what (open polls only): the first 50 of each option.
  Future<List<api.PollVoterOptionDto>> voters(String id, String pollId) async {
    final sealed = await _sealedVoters(id, pollId);
    if (sealed != null) return sealed;
    return (await guardApiCall(
      () => _c.listGroupPollVoters(id: id, pollId: pollId),
    ))
        .data;
  }

  /// G2: an encrypted poll's voters from the votes this device opened, with
  /// the names of the members (membership is open metadata).
  Future<List<api.PollVoterOptionDto>?> _sealedVoters(
    String id,
    String pollId,
  ) async {
    final poll = await _sealedPoll(pollId);
    final e2ee = _e2ee;
    if (poll == null || e2ee == null) return null;
    if (poll.anonymous) return const [];
    final votes = await e2ee.votesOf(pollId);
    final wanted = votes.keys.toSet();
    final people = <String, api.GroupPersonDto>{};
    String? cursor;
    while (wanted.isNotEmpty) {
      final env = await guardApiCall(
        () => _c.listGroupMembers(id: id, cursor: cursor),
      );
      for (final m in env.data) {
        if (!wanted.contains(m.userId)) continue;
        people[m.userId] = api.GroupPersonDto.fromJson({
          ...m.toJson(),
        });
      }
      cursor = env.meta?.nextCursor;
      if (cursor == null || people.length >= wanted.length) break;
    }
    return [
      for (final o in poll.options)
        api.PollVoterOptionDto(
          optionId: o.id,
          voters: [
            for (final v in votes.entries)
              if (v.value.contains(o.id) && people[v.key] != null)
                people[v.key]!,
          ],
        ),
    ];
  }

  /// Sweep B-c1: one option's voters after [cursor], oldest vote first.
  Future<CursorPage<api.GroupPersonDto>> optionVoters(
    String id,
    String pollId,
    String optionId, {
    String? cursor,
    int limit = 50,
  }) async {
    final sealed = await _sealedVoters(id, pollId);
    if (sealed != null) {
      // Counted on this phone: one page holds them all.
      return CursorPage(
        items: [
          for (final o in sealed)
            if (o.optionId == optionId) ...o.voters,
        ],
      );
    }
    final env = await guardApiCall(
      () => _c.listGroupPollOptionVoters(
        id: id,
        pollId: pollId,
        optionId: optionId,
        cursor: cursor,
        limit: limit,
      ),
    );
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }
}
