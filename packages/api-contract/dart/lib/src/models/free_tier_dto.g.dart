// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'free_tier_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FreeTierDto _$FreeTierDtoFromJson(Map<String, dynamic> json) => FreeTierDto(
  label: json['label'] as String,
  used: json['used'] as num,
  free: json['free'] as num,
  unit: json['unit'] as String,
);

Map<String, dynamic> _$FreeTierDtoToJson(FreeTierDto instance) =>
    <String, dynamic>{
      'label': instance.label,
      'used': instance.used,
      'free': instance.free,
      'unit': instance.unit,
    };
