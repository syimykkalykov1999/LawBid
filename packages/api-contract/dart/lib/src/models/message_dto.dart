// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'message_dto_type.dart';
import 'voice_note_dto.dart';

part 'message_dto.g.dart';

@JsonSerializable()
class MessageDto {
  const MessageDto({
    required this.id,
    required this.conversationId,
    required this.type,
    required this.body,
    required this.contactMasked,
    required this.createdAt,
    this.senderId,
    this.voice,
    this.clientMessageId,
  });

  factory MessageDto.fromJson(Map<String, Object?> json) =>
      _$MessageDtoFromJson(json);

  final String id;
  final String conversationId;
  final String? senderId;
  final MessageDtoType type;
  final VoiceNoteDto? voice;

  /// body_display; for type=system a key (offer_accepted, no_agreement, case_closed, accepted_by_other) the app localizes.
  final String body;

  /// Contacts were hidden in this message (§8.3).
  final bool contactMasked;

  /// Only on the viewer's own messages (outbox matching).
  final String? clientMessageId;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$MessageDtoToJson(this);
}
