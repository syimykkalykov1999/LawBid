// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'metrics_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MetricsDayDto _$MetricsDayDtoFromJson(Map<String, dynamic> json) =>
    MetricsDayDto(
      day: json['day'] as String,
      actions: (json['actions'] as num).toInt(),
      appeals: (json['appeals'] as num).toInt(),
      overturned: (json['overturned'] as num).toInt(),
    );

Map<String, dynamic> _$MetricsDayDtoToJson(MetricsDayDto instance) =>
    <String, dynamic>{
      'day': instance.day,
      'actions': instance.actions,
      'appeals': instance.appeals,
      'overturned': instance.overturned,
    };
