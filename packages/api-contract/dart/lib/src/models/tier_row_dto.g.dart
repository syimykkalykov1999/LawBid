// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tier_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TierRowDto _$TierRowDtoFromJson(Map<String, dynamic> json) => TierRowDto(
  name: json['name'] as String,
  memoryGb: json['memoryGb'] as num,
  monthUsd: json['monthUsd'] as num,
  current: json['current'] as bool,
);

Map<String, dynamic> _$TierRowDtoToJson(TierRowDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'memoryGb': instance.memoryGb,
      'monthUsd': instance.monthUsd,
      'current': instance.current,
    };
