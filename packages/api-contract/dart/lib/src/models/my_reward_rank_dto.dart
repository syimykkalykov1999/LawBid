// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_reward_rank_dto_department.dart';

part 'my_reward_rank_dto.g.dart';

@JsonSerializable()
class MyRewardRankDto {
  const MyRewardRankDto({
    required this.department,
    required this.label,
    required this.score,
    required this.of,
    required this.prize,
    this.rank,
    this.leaderName,
  });

  factory MyRewardRankDto.fromJson(Map<String, Object?> json) =>
      _$MyRewardRankDtoFromJson(json);

  final MyRewardRankDtoDepartment department;
  final String label;

  /// null = no points yet.
  final num? rank;
  final num score;

  /// People ranked in the department.
  final num of;
  final String prize;
  final String? leaderName;

  Map<String, Object?> toJson() => _$MyRewardRankDtoToJson(this);
}
