// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'save_email_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SaveEmailTemplateDto _$SaveEmailTemplateDtoFromJson(
  Map<String, dynamic> json,
) => SaveEmailTemplateDto(
  subject: json['subject'] as String,
  textBody: json['textBody'] as String,
  enabled: json['enabled'] as bool,
  htmlBody: json['htmlBody'] as String?,
);

Map<String, dynamic> _$SaveEmailTemplateDtoToJson(
  SaveEmailTemplateDto instance,
) => <String, dynamic>{
  'subject': instance.subject,
  'textBody': instance.textBody,
  'htmlBody': ?instance.htmlBody,
  'enabled': instance.enabled,
};
