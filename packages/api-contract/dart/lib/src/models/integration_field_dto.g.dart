// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integration_field_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationFieldDto _$IntegrationFieldDtoFromJson(Map<String, dynamic> json) =>
    IntegrationFieldDto(
      name: json['name'] as String,
      label: json['label'] as String,
      secret: json['secret'] as bool,
      requiredValue: json['required'] as bool,
      hint: json['hint'] as String?,
    );

Map<String, dynamic> _$IntegrationFieldDtoToJson(
  IntegrationFieldDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'label': instance.label,
  'secret': instance.secret,
  'required': instance.requiredValue,
  'hint': ?instance.hint,
};
