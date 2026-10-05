// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_custom_integration_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCustomIntegrationDto _$CreateCustomIntegrationDtoFromJson(
  Map<String, dynamic> json,
) => CreateCustomIntegrationDto(
  id: json['id'] as String,
  label: json['label'] as String,
  fields: (json['fields'] as List<dynamic>)
      .map((e) => CustomIntegrationFieldDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  description: json['description'] as String?,
);

Map<String, dynamic> _$CreateCustomIntegrationDtoToJson(
  CreateCustomIntegrationDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'label': instance.label,
  'description': ?instance.description,
  'fields': instance.fields.map((e) => e.toJson()).toList(),
};
