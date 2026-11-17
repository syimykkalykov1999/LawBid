import 'package:lawbid/features/chat/domain/chat_models.dart'
    show ChatMessage, MessageKind, MessageReaction, VoiceNote, playableVoiceUrl;
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
    voice: voice,
    poll: poll,
    editedAt: editedAt,
    deleted: deleted,
    createdAt: createdAt,
    expiresAt: expiresAt,
    forwarded: forwarded,
    forwardedFrom: forwardedFrom,
    reactions: reactions,
  );

  /// The local picture of «deleted for everyone» (same as the server's
  /// tombstone: no text, no file, no poll).
  api.GroupMessageDto asTombstone() => api.GroupMessageDto(
    id: id,
    groupId: groupId,
    topicId: topicId,
    type: type,
    sender: sender,
    body: '',
    mine: mine,
    clientMessageId: clientMessageId,
    systemKind: systemKind,
    systemPeople: systemPeople,
    systemText: systemText,
    replyTo: replyTo,
    mentions: const [],
    mentionsMe: false,
    editedAt: editedAt,
    deleted: true,
    createdAt: createdAt,
    expiresAt: expiresAt,
    forwarded: forwarded,
    forwardedFrom: forwardedFrom,
  );

  /// Groups WhatsApp parity: the reactions as the 1:1 chips take them
  /// (none on a deleted message; builds before the field read none).
  List<MessageReaction> get reactionChips => deleted
      ? const []
      : [
          for (final r in reactions ?? const <api.ReactionDto>[])
            MessageReaction(emoji: r.emoji, count: r.count, mine: r.mine),
        ];

  /// The emoji I chose, if any.
  String? get myReaction => reactions?.where((r) => r.mine).firstOrNull?.emoji;

  /// Owner 2026-10-21: disappearing messages — gone by the clock.
  bool isExpired([DateTime? now]) =>
      expiresAt != null && !expiresAt!.isAfter(now ?? DateTime.now());

  bool get isSystem => type == api.GroupMessageDtoType.system;
  bool get isPoll => type == api.GroupMessageDtoType.poll;

  /// Groups WhatsApp parity: a voice note (the 1:1 chat's).
  bool get isVoice => type == api.GroupMessageDtoType.voice && voice != null;

  /// Owner 2026-10-21 (Telegram «Переслать»): a text or a file can be
  /// forwarded; a poll, a service line, a voice note (the server forwards
  /// texts and files of a group), a deleted or a disappearing message
  /// cannot.
  bool get canForward =>
      !deleted &&
      !isSystem &&
      !isPoll &&
      type != api.GroupMessageDtoType.voice &&
      expiresAt == null;

  /// Groups WhatsApp parity: the note as the 1:1 voice bubble and player
  /// take it (`VoiceMessageBody`, `VoicePlayer`: same cache, same speed).
  ChatMessage? get voiceMessage {
    final v = voice;
    if (deleted || v == null) return null;
    return ChatMessage(
      id: id,
      conversationId: groupId,
      senderId: sender?.userId,
      kind: MessageKind.voice,
      body: '',
      clientMessageId: clientMessageId,
      createdAt: createdAt,
      voice: VoiceNote(
        // Owner row 146: the iPhone plays the AAC copy of a browser WebM note.
        url: playableVoiceUrl(v.url, v.m4aUrl),
        durationMs: v.durationMs,
        waveform: v.waveform,
        listened: v.listened,
      ),
    );
  }
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

  /// Owner 2026-10-21 (Telegram «Запретить копирование и пересылку»): no
  /// forwarding, copying or saving of the messages.
  bool get isProtected => protectContent ?? false;

  /// The group has a link to share instead of its content: a public
  /// group's @username or a switched-on invite link.
  bool get hasShareLink =>
      (type == api.GroupType.public && (username?.isNotEmpty ?? false)) ||
      (type != api.GroupType.private && inviteEnabled);
}
