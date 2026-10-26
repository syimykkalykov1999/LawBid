// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplateSummaryDto _$EmailTemplateSummaryDtoFromJson(
  Map<String, dynamic> json,
) => EmailTemplateSummaryDto(
  key: EmailTemplateSummaryDtoKey.fromJson(json['key'] as String),
  title: json['title'] as String,
  description: json['description'] as String,
  variables: (json['variables'] as List<dynamic>)
      .map((e) => EmailTemplateVariableDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  locales: (json['locales'] as List<dynamic>)
      .map(
        (e) => EmailTemplateLocaleStatusDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
);

Map<String, dynamic> _$EmailTemplateSummaryDtoToJson(
  EmailTemplateSummaryDto instance,
) => <String, dynamic>{
  'key': instance.key.toJson(),
  'title': instance.title,
  'description': instance.description,
  'variables': instance.variables.map((e) => e.toJson()).toList(),
  'locales': instance.locales.map((e) => e.toJson()).toList(),
};
