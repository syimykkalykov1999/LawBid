import 'package:lawbid_api/lawbid_api.dart' as api;

/// The generated DTOs are immutable without `copyWith`; these rebuild the
/// one field the realtime events change.
extension GroupMessageDtoX on api.GroupMessageDto {
  api.GroupMessageDto withPoll(api.PollDto poll) => api.GroupMessageDto(
        id: id,
        groupId: groupId,
        topicId: topicId,
        type: type,
        sender: sender,
        body: body,
        mine: mine,
        clientMessageId: clientMessageId,
        systemKind: systemKind,
        systemPeople: systemPeople,
        systemText: systemText,
        replyTo: replyTo,
        mentions: mentions,
        mentionsMe: mentionsMe,
        attachment: attachment,
        poll: poll,
        editedAt: editedAt,
        deleted: deleted,
        createdAt: createdAt,
      );

  bool get isSystem => type == api.GroupMessageDtoType.system;
  bool get isPoll => type == api.GroupMessageDtoType.poll;
}

/// Telegram's checkboxes and member permissions as the screens ask them.
extension GroupRightsX on api.GroupDetailDto {
  /// Whether I hold the admin checkbox [right] (the owner holds all).
  bool hasRight(String right) => myRights.any((r) => r.json == right);

  bool get canPinMessages => hasRight('pin') || whoCanPin == api.GroupWho.all;
  bool get canDeleteOthers => hasRight('delete');
  bool get canBanMembers => hasRight('ban');
  bool get canAppoint => hasRight('admins');
  bool get canSendMedia => isAdmin || whoCanMedia == api.GroupWho.all;
  bool get canSendPolls =>
      isAdmin ||
      (whoCanPost == api.GroupWho.all && whoCanPoll == api.GroupWho.all);
}
