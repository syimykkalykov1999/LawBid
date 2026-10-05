// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reward_metric_dto.dart';

part 'reward_leader_row_dto.g.dart';

@JsonSerializable()
class RewardLeaderRowDto {
  const RewardLeaderRowDto({
    required this.adminId,
    required this.name,
    required this.rank,
    required this.score,
    required this.metrics,
  });

  factory RewardLeaderRowDto.fromJson(Map<String, Object?> json) =>
      _$RewardLeaderRowDtoFromJson(json);

  final String adminId;
  final String name;
  final num rank;
  final num score;
  final List<RewardMetricDto> metrics;

  Map<String, Object?> toJson() => _$RewardLeaderRowDtoToJson(this);
}
