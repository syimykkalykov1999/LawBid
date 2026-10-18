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
  attachments: (json['attachments'] as List<dynamic>?)
      ?.map(
        (e) => SupportAttachmentInputDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  context: json['context'] == null
      ? null
      : SupportClientContextInputDto.fromJson(
          json['context'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$CreateSupportTicketDtoToJson(
  CreateSupportTicketDto instance,
) => <String, dynamic>{
  'subject': instance.subject,
  'category': instance.category.toJson(),
  'body': instance.body,
  'attachments': ?instance.attachments?.map((e) => e.toJson()).toList(),
  'context': ?instance.context?.toJson(),
};
