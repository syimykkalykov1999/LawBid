// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_ticket_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportTicketDetailDto _$AdminSupportTicketDetailDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportTicketDetailDto(
  id: json['id'] as String,
  subject: json['subject'] as String,
  category: AdminSupportTicketDetailDtoCategory.fromJson(
    json['category'] as String,
  ),
  status: AdminSupportTicketDetailDtoStatus.fromJson(json['status'] as String),
  priority: AdminSupportTicketDetailDtoPriority.fromJson(
    json['priority'] as String,
  ),
  user: AdminSupportUserRefDto.fromJson(json['user'] as Map<String, dynamic>),
  unreadByAdmin: json['unreadByAdmin'] as bool,
  unreadByUser: json['unreadByUser'] as bool,
  lastMessageAt: DateTime.parse(json['lastMessageAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  userSummary: AdminSupportUserSummaryDto.fromJson(
    json['userSummary'] as Map<String, dynamic>,
  ),
  messages: (json['messages'] as List<dynamic>)
      .map((e) => AdminSupportMessageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  assigneeId: json['assigneeId'] as String?,
  assigneeName: json['assigneeName'] as String?,
  resolvedAt: json['resolvedAt'] == null
      ? null
      : DateTime.parse(json['resolvedAt'] as String),
);

Map<String, dynamic> _$AdminSupportTicketDetailDtoToJson(
  AdminSupportTicketDetailDto instance,
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
  'userSummary': instance.userSummary.toJson(),
  'messages': instance.messages.map((e) => e.toJson()).toList(),
};
