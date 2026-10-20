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
