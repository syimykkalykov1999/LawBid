// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_config_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateConfigDto _$UpdateConfigDtoFromJson(Map<String, dynamic> json) =>
    UpdateConfigDto(
      value: json['value'],
      expectedUpdatedAt: json['expectedUpdatedAt'] == null
          ? null
          : DateTime.parse(json['expectedUpdatedAt'] as String),
    );

Map<String, dynamic> _$UpdateConfigDtoToJson(UpdateConfigDto instance) =>
    <String, dynamic>{
      'value': ?instance.value,
      'expectedUpdatedAt': ?instance.expectedUpdatedAt?.toIso8601String(),
    };
