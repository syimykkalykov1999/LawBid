// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_variable_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplateVariableDto _$EmailTemplateVariableDtoFromJson(
  Map<String, dynamic> json,
) => EmailTemplateVariableDto(
  name: json['name'] as String,
  description: json['description'] as String,
  sample: json['sample'] as String,
  requiredValue: json['required'] as bool,
);

Map<String, dynamic> _$EmailTemplateVariableDtoToJson(
  EmailTemplateVariableDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'description': instance.description,
  'sample': instance.sample,
  'required': instance.requiredValue,
};
