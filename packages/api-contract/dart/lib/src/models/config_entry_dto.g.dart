// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'config_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConfigEntryDto _$ConfigEntryDtoFromJson(Map<String, dynamic> json) =>
    ConfigEntryDto(
      key: json['key'] as String,
      type: ConfigEntryDtoType.fromJson(json['type'] as String),
      value: json['value'],
      defaultValue: json['defaultValue'],
      description: json['description'] as String?,
      min: json['min'] as num?,
      max: json['max'] as num?,
      stored: json['stored'] as bool,
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$ConfigEntryDtoToJson(ConfigEntryDto instance) =>
    <String, dynamic>{
      'key': instance.key,
      'type': instance.type.toJson(),
      'value': ?instance.value,
      'defaultValue': ?instance.defaultValue,
      'description': ?instance.description,
      'min': ?instance.min,
      'max': ?instance.max,
      'stored': instance.stored,
      'updatedAt': ?instance.updatedAt?.toIso8601String(),
    };
