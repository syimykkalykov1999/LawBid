// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'test_email_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TestEmailTemplateDto _$TestEmailTemplateDtoFromJson(
  Map<String, dynamic> json,
) => TestEmailTemplateDto(
  subject: json['subject'] as String?,
  textBody: json['textBody'] as String?,
  htmlBody: json['htmlBody'] as String?,
);

Map<String, dynamic> _$TestEmailTemplateDtoToJson(
  TestEmailTemplateDto instance,
) => <String, dynamic>{
  'subject': ?instance.subject,
  'textBody': ?instance.textBody,
  'htmlBody': ?instance.htmlBody,
};
