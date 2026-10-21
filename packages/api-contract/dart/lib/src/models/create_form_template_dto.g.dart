// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_form_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateFormTemplateDto _$CreateFormTemplateDtoFromJson(
  Map<String, dynamic> json,
) => CreateFormTemplateDto(
  slug: json['slug'] as String,
  title: Map<String, String>.from(json['title'] as Map),
  body: Map<String, String>.from(json['body'] as Map),
  fields: (json['fields'] as List<dynamic>)
      .map((e) => FormFieldDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  description: (json['description'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  practiceAreaId: json['practiceAreaId'] as String?,
  position: json['position'] as num?,
  published: json['published'] as bool?,
);

Map<String, dynamic> _$CreateFormTemplateDtoToJson(
  CreateFormTemplateDto instance,
) => <String, dynamic>{
  'slug': instance.slug,
  'title': instance.title,
  'description': ?instance.description,
  'body': instance.body,
  'fields': instance.fields.map((e) => e.toJson()).toList(),
  'practiceAreaId': ?instance.practiceAreaId,
  'position': ?instance.position,
  'published': ?instance.published,
};
