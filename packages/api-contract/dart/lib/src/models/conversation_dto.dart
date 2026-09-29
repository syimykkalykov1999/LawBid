// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conversation_counterpart_dto.dart';
import 'conversation_dto_status.dart';
import 'message_dto.dart';

part 'conversation_dto.g.dart';

@JsonSerializable()
class ConversationDto {
  const ConversationDto({
    required this.id,
    required this.caseId,
    required this.caseTitle,
    required this.status,
    required this.contactsUnlocked,
    required this.counterpart,
    required this.unreadCount,
    required this.updatedAt,
    this.lastMessage,
    this.lastMessageAt,
    this.mutedUntil,
    this.counterpartLastReadMessageId,
  });

  factory ConversationDto.fromJson(Map<String, Object?> json) =>
      _$ConversationDtoFromJson(json);

  final String id;
  final String caseId;
  final String caseTitle;
  final ConversationDtoStatus status;
  final bool contactsUnlocked;
  final ConversationCounterpartDto counterpart;
  final MessageDto? lastMessage;
  final DateTime? lastMessageAt;
  final num unreadCount;
  final DateTime? mutedUntil;

  /// For "Seen" on own messages (§8.2).
  final String? counterpartLastReadMessageId;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$ConversationDtoToJson(this);
}
