// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'form_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FormTemplateDto _$FormTemplateDtoFromJson(Map<String, dynamic> json) =>
    FormTemplateDto(
      id: json['id'] as String,
      slug: json['slug'] as String,
      title: Map<String, String>.from(json['title'] as Map),
      description: Map<String, String>.from(json['description'] as Map),
      languages: (json['languages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      fields: (json['fields'] as List<dynamic>)
          .map((e) => FormFieldDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$FormTemplateDtoToJson(FormTemplateDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'slug': instance.slug,
      'title': instance.title,
      'description': instance.description,
      'languages': instance.languages,
      'fields': instance.fields.map((e) => e.toJson()).toList(),
    };
