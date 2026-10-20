// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_form_templates_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseFormTemplatesDto _$CaseFormTemplatesDtoFromJson(
  Map<String, dynamic> json,
) => CaseFormTemplatesDto(
  prefill: Map<String, String>.from(json['prefill'] as Map),
  templates: (json['templates'] as List<dynamic>)
      .map((e) => FormTemplateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CaseFormTemplatesDtoToJson(
  CaseFormTemplatesDto instance,
) => <String, dynamic>{
  'prefill': instance.prefill,
  'templates': instance.templates.map((e) => e.toJson()).toList(),
};
