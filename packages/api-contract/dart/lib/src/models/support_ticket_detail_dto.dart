// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'support_message_dto.dart';
import 'support_ticket_detail_dto_category.dart';
import 'support_ticket_detail_dto_status.dart';

part 'support_ticket_detail_dto.g.dart';

@JsonSerializable()
class SupportTicketDetailDto {
  const SupportTicketDetailDto({
    required this.id,
    required this.subject,
    required this.category,
    required this.status,
    required this.unread,
    required this.lastMessageAt,
    required this.createdAt,
    required this.canReply,
    required this.messages,
    this.resolvedAt,
  });

  factory SupportTicketDetailDto.fromJson(Map<String, Object?> json) =>
      _$SupportTicketDetailDtoFromJson(json);

  final String id;
  final String subject;
  final SupportTicketDetailDtoCategory category;
  final SupportTicketDetailDtoStatus status;

  /// Support replied and the user has not opened it yet.
  final bool unread;
  final DateTime lastMessageAt;
  final DateTime createdAt;
  final DateTime? resolvedAt;

  /// false once the ticket is closed.
  final bool canReply;
  final List<SupportMessageDto> messages;

  Map<String, Object?> toJson() => _$SupportTicketDetailDtoToJson(this);
}
