// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'age_gate_config_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AgeGateConfigDto _$AgeGateConfigDtoFromJson(Map<String, dynamic> json) =>
    AgeGateConfigDto(
      mode: json['mode'] as String,
      minAge: json['minAge'] as num,
      textVersion: json['textVersion'] as String,
      requireBirthDate: json['requireBirthDate'] as bool,
    );

Map<String, dynamic> _$AgeGateConfigDtoToJson(AgeGateConfigDto instance) =>
    <String, dynamic>{
      'mode': instance.mode,
      'minAge': instance.minAge,
      'textVersion': instance.textVersion,
      'requireBirthDate': instance.requireBirthDate,
    };
