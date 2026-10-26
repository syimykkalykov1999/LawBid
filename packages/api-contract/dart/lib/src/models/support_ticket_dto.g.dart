// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_ticket_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportTicketDto _$SupportTicketDtoFromJson(Map<String, dynamic> json) =>
    SupportTicketDto(
      id: json['id'] as String,
      subject: json['subject'] as String,
      category: SupportTicketDtoCategory.fromJson(json['category'] as String),
      status: SupportTicketDtoStatus.fromJson(json['status'] as String),
      unread: json['unread'] as bool,
      lastMessageAt: DateTime.parse(json['lastMessageAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      canReply: json['canReply'] as bool,
      resolvedAt: json['resolvedAt'] == null
          ? null
          : DateTime.parse(json['resolvedAt'] as String),
    );

Map<String, dynamic> _$SupportTicketDtoToJson(SupportTicketDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'subject': instance.subject,
      'category': instance.category.toJson(),
      'status': instance.status.toJson(),
      'unread': instance.unread,
      'lastMessageAt': instance.lastMessageAt.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
      'canReply': instance.canReply,
    };
