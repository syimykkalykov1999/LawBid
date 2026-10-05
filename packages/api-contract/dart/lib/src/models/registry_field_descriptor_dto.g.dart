// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_field_descriptor_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryFieldDescriptorDto _$RegistryFieldDescriptorDtoFromJson(
  Map<String, dynamic> json,
) => RegistryFieldDescriptorDto(
  name: json['name'] as String,
  label: json['label'] as String,
  requiredValue: json['required'] as bool,
  placeholder: json['placeholder'] as String?,
  help: json['help'] as String?,
  options: (json['options'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$RegistryFieldDescriptorDtoToJson(
  RegistryFieldDescriptorDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'label': instance.label,
  'required': instance.requiredValue,
  'placeholder': ?instance.placeholder,
  'help': ?instance.help,
  'options': ?instance.options,
};
