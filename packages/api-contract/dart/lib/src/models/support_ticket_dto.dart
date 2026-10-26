// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'support_ticket_dto_category.dart';
import 'support_ticket_dto_status.dart';

part 'support_ticket_dto.g.dart';

@JsonSerializable()
class SupportTicketDto {
  const SupportTicketDto({
    required this.id,
    required this.subject,
    required this.category,
    required this.status,
    required this.unread,
    required this.lastMessageAt,
    required this.createdAt,
    required this.canReply,
    this.resolvedAt,
  });

  factory SupportTicketDto.fromJson(Map<String, Object?> json) =>
      _$SupportTicketDtoFromJson(json);

  final String id;
  final String subject;
  final SupportTicketDtoCategory category;
  final SupportTicketDtoStatus status;

  /// Support replied and the user has not opened it yet.
  final bool unread;
  final DateTime lastMessageAt;
  final DateTime createdAt;
  final DateTime? resolvedAt;

  /// false once the ticket is closed.
  final bool canReply;

  Map<String, Object?> toJson() => _$SupportTicketDtoToJson(this);
}
