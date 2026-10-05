// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reward_metric_dto.g.dart';

@JsonSerializable()
class RewardMetricDto {
  const RewardMetricDto({required this.key, required this.label, this.value});

  factory RewardMetricDto.fromJson(Map<String, Object?> json) =>
      _$RewardMetricDtoFromJson(json);

  final String key;
  final String label;
  final num? value;

  Map<String, Object?> toJson() => _$RewardMetricDtoToJson(this);
}
