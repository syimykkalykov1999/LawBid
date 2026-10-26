// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'spend_line_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SpendLineDto _$SpendLineDtoFromJson(Map<String, dynamic> json) => SpendLineDto(
  key: SpendLineDtoKey.fromJson(json['key'] as String),
  monthToDateUsd: json['monthToDateUsd'] as num,
  projectedUsd: json['projectedUsd'] as num,
  source: SpendLineDtoSource.fromJson(json['source'] as String),
);

Map<String, dynamic> _$SpendLineDtoToJson(SpendLineDto instance) =>
    <String, dynamic>{
      'key': instance.key.toJson(),
      'monthToDateUsd': instance.monthToDateUsd,
      'projectedUsd': instance.projectedUsd,
      'source': instance.source.toJson(),
    };
