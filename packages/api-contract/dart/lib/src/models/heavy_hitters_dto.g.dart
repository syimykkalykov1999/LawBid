// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'heavy_hitters_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HeavyHittersDto _$HeavyHittersDtoFromJson(Map<String, dynamic> json) =>
    HeavyHittersDto(
      enabled: json['enabled'] as bool,
      windowMinutes: json['windowMinutes'] as num,
      sampleEvery: json['sampleEvery'] as num,
      metrics: (json['metrics'] as List<dynamic>)
          .map((e) => HeavyMetricDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$HeavyHittersDtoToJson(HeavyHittersDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'windowMinutes': instance.windowMinutes,
      'sampleEvery': instance.sampleEvery,
      'metrics': instance.metrics.map((e) => e.toJson()).toList(),
    };
