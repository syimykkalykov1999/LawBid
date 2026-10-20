// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_message_body_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportMessageBodyDto _$SupportMessageBodyDtoFromJson(
  Map<String, dynamic> json,
) => SupportMessageBodyDto(
  body: json['body'] as String,
  attachments: (json['attachments'] as List<dynamic>?)
      ?.map(
        (e) => SupportAttachmentInputDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
);

Map<String, dynamic> _$SupportMessageBodyDtoToJson(
  SupportMessageBodyDto instance,
) => <String, dynamic>{
  'body': instance.body,
  'attachments': ?instance.attachments?.map((e) => e.toJson()).toList(),
};
