// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_ticket_row_dto_category.dart';
import 'admin_support_ticket_row_dto_priority.dart';
import 'admin_support_ticket_row_dto_status.dart';
import 'admin_support_user_ref_dto.dart';

part 'admin_support_ticket_row_dto.g.dart';

@JsonSerializable()
class AdminSupportTicketRowDto {
  const AdminSupportTicketRowDto({
    required this.id,
    required this.subject,
    required this.category,
    required this.status,
    required this.priority,
    required this.user,
    required this.unreadByAdmin,
    required this.unreadByUser,
    required this.lastMessageAt,
    required this.createdAt,
    this.assigneeId,
    this.assigneeName,
    this.resolvedAt,
  });

  factory AdminSupportTicketRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportTicketRowDtoFromJson(json);

  final String id;
  final String subject;
  final AdminSupportTicketRowDtoCategory category;
  final AdminSupportTicketRowDtoStatus status;
  final AdminSupportTicketRowDtoPriority priority;
  final AdminSupportUserRefDto user;
  final String? assigneeId;
  final String? assigneeName;
  final bool unreadByAdmin;
  final bool unreadByUser;
  final DateTime lastMessageAt;
  final DateTime createdAt;
  final DateTime? resolvedAt;

  Map<String, Object?> toJson() => _$AdminSupportTicketRowDtoToJson(this);
}
