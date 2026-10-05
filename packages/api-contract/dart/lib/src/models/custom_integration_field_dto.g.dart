// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'custom_integration_field_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CustomIntegrationFieldDto _$CustomIntegrationFieldDtoFromJson(
  Map<String, dynamic> json,
) => CustomIntegrationFieldDto(
  name: json['name'] as String,
  label: json['label'] as String,
  secret: json['secret'] as bool,
  requiredValue: json['required'] as bool,
);

Map<String, dynamic> _$CustomIntegrationFieldDtoToJson(
  CustomIntegrationFieldDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'label': instance.label,
  'secret': instance.secret,
  'required': instance.requiredValue,
};
