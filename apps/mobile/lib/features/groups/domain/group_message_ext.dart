import 'package:lawbid/shared/domain/reaction_palette.dart';
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
        expiresAt: expiresAt,
        forwarded: forwarded,
        forwardedFrom: forwardedFrom,
        reactions: reactions,
        myReaction: myReaction,
      );

  /// Owner 2026-10-21: disappearing messages — gone by the clock.
  bool isExpired([DateTime? now]) =>
      expiresAt != null && !expiresAt!.isAfter(now ?? DateTime.now());

  bool get isSystem => type == api.GroupMessageDtoType.system;
  bool get isPoll => type == api.GroupMessageDtoType.poll;

  /// Owner 2026-10-21 (Telegram «Переслать»): a text or a file can be
  /// forwarded; a poll, a service line, a deleted or a disappearing
  /// message cannot.
  bool get canForward => !deleted && !isSystem && !isPoll && expiresAt == null;
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

  /// Owner 2026-10-21 (inbox 26c): the reactions members may put here.
  List<String> get reactionOptions => reactionChoices(
        ReactionsMode.parse(reactionsMode?.json),
        reactionsAllowed ?? const [],
      );

  /// Owner 2026-10-21 (Telegram «Запретить копирование и пересылку»): no
  /// forwarding, copying or saving of the messages.
  bool get isProtected => protectContent ?? false;

  /// The group has a link to share instead of its content: a public
  /// group's @username or a switched-on invite link.
  bool get hasShareLink =>
      (type == api.GroupType.public && (username?.isNotEmpty ?? false)) ||
      (type != api.GroupType.private && inviteEnabled);
}
