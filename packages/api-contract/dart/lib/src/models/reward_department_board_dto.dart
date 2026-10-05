// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reward_award_dto.dart';
import 'reward_department_board_dto_key.dart';
import 'reward_leader_row_dto.dart';

part 'reward_department_board_dto.g.dart';

@JsonSerializable()
class RewardDepartmentBoardDto {
  const RewardDepartmentBoardDto({
    required this.key,
    required this.label,
    required this.prize,
    required this.bonusCents,
    required this.members,
    required this.rows,
    this.award,
  });

  factory RewardDepartmentBoardDto.fromJson(Map<String, Object?> json) =>
      _$RewardDepartmentBoardDtoFromJson(json);

  final RewardDepartmentBoardDtoKey key;
  final String label;
  final String prize;
  final num bonusCents;

  /// People in the department (with the right).
  final num members;
  final List<RewardLeaderRowDto> rows;
  final RewardAwardDto? award;

  Map<String, Object?> toJson() => _$RewardDepartmentBoardDtoToJson(this);
}
