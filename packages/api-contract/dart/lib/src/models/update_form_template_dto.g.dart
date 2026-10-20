// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_form_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateFormTemplateDto _$UpdateFormTemplateDtoFromJson(
  Map<String, dynamic> json,
) => UpdateFormTemplateDto(
  title: (json['title'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  description: (json['description'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  body: (json['body'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  fields: (json['fields'] as List<dynamic>?)
      ?.map((e) => FormFieldDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  practiceAreaId: json['practiceAreaId'] as String?,
  position: json['position'] as num?,
  published: json['published'] as bool?,
);

Map<String, dynamic> _$UpdateFormTemplateDtoToJson(
  UpdateFormTemplateDto instance,
) => <String, dynamic>{
  'title': ?instance.title,
  'description': ?instance.description,
  'body': ?instance.body,
  'fields': ?instance.fields?.map((e) => e.toJson()).toList(),
  'practiceAreaId': ?instance.practiceAreaId,
  'position': ?instance.position,
  'published': ?instance.published,
};
