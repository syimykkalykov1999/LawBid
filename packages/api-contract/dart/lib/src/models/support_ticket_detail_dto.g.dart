// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_ticket_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportTicketDetailDto _$SupportTicketDetailDtoFromJson(
  Map<String, dynamic> json,
) => SupportTicketDetailDto(
  id: json['id'] as String,
  subject: json['subject'] as String,
  category: SupportTicketDetailDtoCategory.fromJson(json['category'] as String),
  status: SupportTicketDetailDtoStatus.fromJson(json['status'] as String),
  unread: json['unread'] as bool,
  lastMessageAt: DateTime.parse(json['lastMessageAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  canReply: json['canReply'] as bool,
  messages: (json['messages'] as List<dynamic>)
      .map((e) => SupportMessageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  resolvedAt: json['resolvedAt'] == null
      ? null
      : DateTime.parse(json['resolvedAt'] as String),
);

Map<String, dynamic> _$SupportTicketDetailDtoToJson(
  SupportTicketDetailDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'subject': instance.subject,
  'category': instance.category.toJson(),
  'status': instance.status.toJson(),
  'unread': instance.unread,
  'lastMessageAt': instance.lastMessageAt.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
  'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
  'canReply': instance.canReply,
  'messages': instance.messages.map((e) => e.toJson()).toList(),
};
