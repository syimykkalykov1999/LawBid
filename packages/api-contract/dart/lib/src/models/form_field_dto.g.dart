// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'form_field_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FormFieldDto _$FormFieldDtoFromJson(Map<String, dynamic> json) => FormFieldDto(
  key: json['key'] as String,
  type: FormFieldDtoType.fromJson(json['type'] as String),
  requiredValue: json['required'] as bool,
  label: Map<String, String>.from(json['label'] as Map),
  prefill: json['prefill'] == null
      ? null
      : FormFieldDtoPrefill.fromJson(json['prefill'] as String),
);

Map<String, dynamic> _$FormFieldDtoToJson(FormFieldDto instance) =>
    <String, dynamic>{
      'key': instance.key,
      'type': instance.type.toJson(),
      'required': instance.requiredValue,
      'label': instance.label,
      'prefill': ?instance.prefill?.toJson(),
    };
