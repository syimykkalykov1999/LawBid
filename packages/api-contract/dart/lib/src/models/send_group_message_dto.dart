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
    this.durationMs,
    this.waveform,
    this.ciphertext,
    this.mlsEpoch,
    this.mlsDeviceId,
    this.frankingTag,
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

  /// type=attachment: a clean `chat_attachment` file; type=voice: a clean `chat_voice` file of the sender.
  final String? fileId;

  /// type=attachment.
  final String? fileName;

  /// type=voice.
  final int? durationMs;

  /// type=voice: up to 100 bars, each 0–100.
  final List<int>? waveform;

  /// type=mls: base64 of the MLS PrivateMessage (an application message of the group’s MLS group). The server stores only this.
  final String? ciphertext;

  /// type=mls: the epoch the message was encrypted in.
  final int? mlsEpoch;

  /// type=mls: the sending MLS device (POST /e2ee/devices).
  final String? mlsDeviceId;

  /// type=mls (message franking): base64 of HMAC-SHA256(k, P), k inside the plaintext P.
  final String? frankingTag;

  Map<String, Object?> toJson() => _$SendGroupMessageDtoToJson(this);
}
