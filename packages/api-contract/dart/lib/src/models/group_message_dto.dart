// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'chat_attachment_dto.dart';
import 'group_message_dto_type.dart';
import 'group_person_dto.dart';
import 'group_reply_preview_dto.dart';
import 'poll_dto.dart';

part 'group_message_dto.g.dart';

@JsonSerializable()
class GroupMessageDto {
  const GroupMessageDto({
    required this.id,
    required this.groupId,
    required this.type,
    required this.body,
    required this.mine,
    required this.clientMessageId,
    required this.mentions,
    required this.mentionsMe,
    required this.deleted,
    required this.createdAt,
    this.topicId,
    this.sender,
    this.systemKind,
    this.systemPeople,
    this.systemText,
    this.replyTo,
    this.attachment,
    this.poll,
    this.editedAt,
  });

  factory GroupMessageDto.fromJson(Map<String, Object?> json) =>
      _$GroupMessageDtoFromJson(json);

  final String id;
  final String groupId;

  /// Forum groups: the topic; null = «General».
  final String? topicId;
  final GroupMessageDtoType type;
  final GroupPersonDto? sender;

  /// Empty for system / poll / deleted messages.
  final String body;
  final bool mine;
  final String clientMessageId;

  /// System messages: created | added | removed | left | joined | renamed | photo | description | promoted | demoted | pinned | poll_closed.
  final String? systemKind;

  /// System messages: who acted (first) and who it concerned.
  final List<GroupPersonDto>? systemPeople;

  /// System messages: the new title (renamed / created).
  final String? systemText;
  final GroupReplyPreviewDto? replyTo;
  final List<GroupPersonDto> mentions;

  /// I am @mentioned.
  final bool mentionsMe;
  final ChatAttachmentDto? attachment;
  final PollDto? poll;
  final DateTime? editedAt;

  /// Deleted for everyone.
  final bool deleted;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$GroupMessageDtoToJson(this);
}
