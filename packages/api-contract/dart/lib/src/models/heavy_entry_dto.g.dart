// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'heavy_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HeavyEntryDto _$HeavyEntryDtoFromJson(Map<String, dynamic> json) =>
    HeavyEntryDto(
      id: json['id'] as String,
      score: json['score'] as num,
      label: json['label'] as String?,
      role: json['role'] as String?,
    );

Map<String, dynamic> _$HeavyEntryDtoToJson(HeavyEntryDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'score': instance.score,
      'label': ?instance.label,
      'role': ?instance.role,
    };
