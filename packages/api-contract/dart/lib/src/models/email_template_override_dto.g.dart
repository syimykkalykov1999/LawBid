// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_override_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplateOverrideDto _$EmailTemplateOverrideDtoFromJson(
  Map<String, dynamic> json,
) => EmailTemplateOverrideDto(
  subject: json['subject'] as String,
  textBody: json['textBody'] as String,
  enabled: json['enabled'] as bool,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  htmlBody: json['htmlBody'] as String?,
  updatedBy: json['updatedBy'] as String?,
);

Map<String, dynamic> _$EmailTemplateOverrideDtoToJson(
  EmailTemplateOverrideDto instance,
) => <String, dynamic>{
  'subject': instance.subject,
  'textBody': instance.textBody,
  'htmlBody': ?instance.htmlBody,
  'enabled': instance.enabled,
  'updatedBy': ?instance.updatedBy,
  'updatedAt': instance.updatedAt.toIso8601String(),
};
