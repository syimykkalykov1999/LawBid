// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'detection_metric_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DetectionMetricDto _$DetectionMetricDtoFromJson(Map<String, dynamic> json) =>
    DetectionMetricDto(
      mode: json['mode'] as String,
      count: (json['count'] as num).toInt(),
      acted: (json['acted'] as num).toInt(),
    );

Map<String, dynamic> _$DetectionMetricDtoToJson(DetectionMetricDto instance) =>
    <String, dynamic>{
      'mode': instance.mode,
      'count': instance.count,
      'acted': instance.acted,
    };
