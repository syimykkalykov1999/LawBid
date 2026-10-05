// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_adapter_descriptor_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryAdapterDescriptorDto _$RegistryAdapterDescriptorDtoFromJson(
  Map<String, dynamic> json,
) => RegistryAdapterDescriptorDto(
  type: RegistryAdapterDescriptorDtoType.fromJson(json['type'] as String),
  label: json['label'] as String,
  description: json['description'] as String,
  fields: (json['fields'] as List<dynamic>)
      .map(
        (e) => RegistryFieldDescriptorDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  secret: RegistryAdapterDescriptorDtoSecret.fromJson(json['secret'] as String),
  secretLabel: json['secretLabel'] as String?,
);

Map<String, dynamic> _$RegistryAdapterDescriptorDtoToJson(
  RegistryAdapterDescriptorDto instance,
) => <String, dynamic>{
  'type': instance.type.toJson(),
  'label': instance.label,
  'description': instance.description,
  'fields': instance.fields.map((e) => e.toJson()).toList(),
  'secret': instance.secret.toJson(),
  'secretLabel': ?instance.secretLabel,
};
