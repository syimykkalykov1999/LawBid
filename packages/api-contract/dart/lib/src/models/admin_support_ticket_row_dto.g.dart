// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_ticket_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportTicketRowDto _$AdminSupportTicketRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportTicketRowDto(
  id: json['id'] as String,
  subject: json['subject'] as String,
  category: AdminSupportTicketRowDtoCategory.fromJson(
    json['category'] as String,
  ),
  status: AdminSupportTicketRowDtoStatus.fromJson(json['status'] as String),
  priority: AdminSupportTicketRowDtoPriority.fromJson(
    json['priority'] as String,
  ),
  user: AdminSupportUserRefDto.fromJson(json['user'] as Map<String, dynamic>),
  unreadByAdmin: json['unreadByAdmin'] as bool,
  unreadByUser: json['unreadByUser'] as bool,
  lastMessageAt: DateTime.parse(json['lastMessageAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  assigneeId: json['assigneeId'] as String?,
  assigneeName: json['assigneeName'] as String?,
  resolvedAt: json['resolvedAt'] == null
      ? null
      : DateTime.parse(json['resolvedAt'] as String),
);

Map<String, dynamic> _$AdminSupportTicketRowDtoToJson(
  AdminSupportTicketRowDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'subject': instance.subject,
  'category': instance.category.toJson(),
  'status': instance.status.toJson(),
  'priority': instance.priority.toJson(),
  'user': instance.user.toJson(),
  'assigneeId': ?instance.assigneeId,
  'assigneeName': ?instance.assigneeName,
  'unreadByAdmin': instance.unreadByAdmin,
  'unreadByUser': instance.unreadByUser,
  'lastMessageAt': instance.lastMessageAt.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
  'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
};
