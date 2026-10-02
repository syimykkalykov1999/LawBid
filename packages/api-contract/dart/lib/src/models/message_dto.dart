// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_log_dto.dart';
import 'chat_attachment_dto.dart';
import 'message_dto_type.dart';
import 'sticker_dto.dart';
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
    this.sentByAssistant,
    this.sticker,
    this.voice,
    this.attachment,
    this.call,
    this.clientMessageId,
  });

  factory MessageDto.fromJson(Map<String, Object?> json) =>
      _$MessageDtoFromJson(json);

  final String id;
  final String conversationId;
  final String? senderId;

  /// OQ-048: sent by the attorney's assistant — their name (shown as "Assistant of …").
  final String? sentByAssistant;
  final MessageDtoType type;

  /// Owner 2026-10-01: the sticker of a sticker message.
  final StickerDto? sticker;
  final VoiceNoteDto? voice;
  final ChatAttachmentDto? attachment;
  final CallLogDto? call;

  /// body_display; for type=system a key (offer_accepted, no_agreement, case_closed, accepted_by_other) the app localizes.
  final String body;

  /// Contacts were hidden in this message (§8.3).
  final bool contactMasked;

  /// Only on the viewer's own messages (outbox matching).
  final String? clientMessageId;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$MessageDtoToJson(this);
}
