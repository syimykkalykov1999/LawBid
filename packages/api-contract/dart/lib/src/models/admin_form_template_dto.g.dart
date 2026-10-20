// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_form_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminFormTemplateDto _$AdminFormTemplateDtoFromJson(
  Map<String, dynamic> json,
) => AdminFormTemplateDto(
  id: json['id'] as String,
  slug: json['slug'] as String,
  title: Map<String, String>.from(json['title'] as Map),
  description: Map<String, String>.from(json['description'] as Map),
  body: Map<String, String>.from(json['body'] as Map),
  fields: (json['fields'] as List<dynamic>)
      .map((e) => FormFieldDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  practiceAreaId: json['practiceAreaId'] as String?,
  position: json['position'] as num,
  published: json['published'] as bool,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$AdminFormTemplateDtoToJson(
  AdminFormTemplateDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'slug': instance.slug,
  'title': instance.title,
  'description': instance.description,
  'body': instance.body,
  'fields': instance.fields.map((e) => e.toJson()).toList(),
  'practiceAreaId': ?instance.practiceAreaId,
  'position': instance.position,
  'published': instance.published,
  'updatedAt': instance.updatedAt.toIso8601String(),
};
