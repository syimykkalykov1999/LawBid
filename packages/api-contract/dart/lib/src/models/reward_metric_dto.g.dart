// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_metric_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardMetricDto _$RewardMetricDtoFromJson(Map<String, dynamic> json) =>
    RewardMetricDto(
      key: json['key'] as String,
      label: json['label'] as String,
      value: json['value'] as num?,
    );

Map<String, dynamic> _$RewardMetricDtoToJson(RewardMetricDto instance) =>
    <String, dynamic>{
      'key': instance.key,
      'label': instance.label,
      'value': ?instance.value,
    };
