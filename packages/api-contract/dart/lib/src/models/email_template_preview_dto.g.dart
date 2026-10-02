// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplatePreviewDto _$EmailTemplatePreviewDtoFromJson(
  Map<String, dynamic> json,
) => EmailTemplatePreviewDto(
  subject: json['subject'] as String,
  text: json['text'] as String,
  unknownVariables: (json['unknownVariables'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  html: json['html'] as String?,
);

Map<String, dynamic> _$EmailTemplatePreviewDtoToJson(
  EmailTemplatePreviewDto instance,
) => <String, dynamic>{
  'subject': instance.subject,
  'text': instance.text,
  'html': ?instance.html,
  'unknownVariables': instance.unknownVariables,
};
