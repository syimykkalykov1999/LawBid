// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_message_dto.dart';
import 'admin_support_ticket_detail_dto_category.dart';
import 'admin_support_ticket_detail_dto_priority.dart';
import 'admin_support_ticket_detail_dto_status.dart';
import 'admin_support_user_ref_dto.dart';
import 'admin_support_user_summary_dto.dart';

part 'admin_support_ticket_detail_dto.g.dart';

@JsonSerializable()
class AdminSupportTicketDetailDto {
  const AdminSupportTicketDetailDto({
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
    required this.userSummary,
    required this.messages,
    this.assigneeId,
    this.assigneeName,
    this.resolvedAt,
  });

  factory AdminSupportTicketDetailDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportTicketDetailDtoFromJson(json);

  final String id;
  final String subject;
  final AdminSupportTicketDetailDtoCategory category;
  final AdminSupportTicketDetailDtoStatus status;
  final AdminSupportTicketDetailDtoPriority priority;
  final AdminSupportUserRefDto user;
  final String? assigneeId;
  final String? assigneeName;
  final bool unreadByAdmin;
  final bool unreadByUser;
  final DateTime lastMessageAt;
  final DateTime createdAt;
  final DateTime? resolvedAt;
  final AdminSupportUserSummaryDto userSummary;
  final List<AdminSupportMessageDto> messages;

  Map<String, Object?> toJson() => _$AdminSupportTicketDetailDtoToJson(this);
}
