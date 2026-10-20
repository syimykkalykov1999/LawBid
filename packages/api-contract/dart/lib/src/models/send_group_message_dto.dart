// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'send_group_message_dto_type.dart';

part 'send_group_message_dto.g.dart';

@JsonSerializable()
class SendGroupMessageDto {
  const SendGroupMessageDto({
    required this.clientMessageId,
    required this.type,
    this.body,
    this.topicId,
    this.replyToId,
    this.mentionIds,
    this.fileId,
    this.fileName,
  });

  factory SendGroupMessageDto.fromJson(Map<String, Object?> json) =>
      _$SendGroupMessageDtoFromJson(json);

  /// Client-generated idempotency key.
  final String clientMessageId;
  final SendGroupMessageDtoType type;

  /// The text, or the caption of an attachment.
  final String? body;

  /// Forum groups: the topic to write in (default «General»).
  final String? topicId;

  /// A quoted message.
  final String? replyToId;

  /// @mentioned members (the app puts @username in the text).
  final List<String>? mentionIds;

  /// type=attachment.
  final String? fileId;

  /// type=attachment.
  final String? fileName;

  Map<String, Object?> toJson() => _$SendGroupMessageDtoToJson(this);
}
