// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reward_department_board_dto.dart';

part 'reward_leaderboard_dto.g.dart';

@JsonSerializable()
class RewardLeaderboardDto {
  const RewardLeaderboardDto({
    required this.period,
    required this.from,
    required this.to,
    required this.closed,
    required this.departments,
  });

  factory RewardLeaderboardDto.fromJson(Map<String, Object?> json) =>
      _$RewardLeaderboardDtoFromJson(json);

  final String period;
  final DateTime from;
  final DateTime to;

  /// The period is over (prizes can be given).
  final bool closed;
  final List<RewardDepartmentBoardDto> departments;

  Map<String, Object?> toJson() => _$RewardLeaderboardDtoToJson(this);
}
