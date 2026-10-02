// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_support_ticket_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateSupportTicketDto _$CreateSupportTicketDtoFromJson(
  Map<String, dynamic> json,
) => CreateSupportTicketDto(
  subject: json['subject'] as String,
  category: CreateSupportTicketDtoCategory.fromJson(json['category'] as String),
  body: json['body'] as String,
);

Map<String, dynamic> _$CreateSupportTicketDtoToJson(
  CreateSupportTicketDto instance,
) => <String, dynamic>{
  'subject': instance.subject,
  'category': instance.category.toJson(),
  'body': instance.body,
};
