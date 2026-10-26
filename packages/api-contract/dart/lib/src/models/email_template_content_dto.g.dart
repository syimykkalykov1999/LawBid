// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_content_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplateContentDto _$EmailTemplateContentDtoFromJson(
  Map<String, dynamic> json,
) => EmailTemplateContentDto(
  subject: json['subject'] as String,
  textBody: json['textBody'] as String,
  htmlBody: json['htmlBody'] as String?,
);

Map<String, dynamic> _$EmailTemplateContentDtoToJson(
  EmailTemplateContentDto instance,
) => <String, dynamic>{
  'subject': instance.subject,
  'textBody': instance.textBody,
  'htmlBody': ?instance.htmlBody,
};
