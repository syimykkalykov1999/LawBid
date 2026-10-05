// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_reward_award_dto_department.dart';

part 'create_reward_award_dto.g.dart';

@JsonSerializable()
class CreateRewardAwardDto {
  const CreateRewardAwardDto({
    required this.period,
    required this.department,
    required this.adminId,
    this.prize,
    this.bonusCents,
  });

  factory CreateRewardAwardDto.fromJson(Map<String, Object?> json) =>
      _$CreateRewardAwardDtoFromJson(json);

  final String period;
  final CreateRewardAwardDtoDepartment department;
  final String adminId;

  /// Default: the department prize.
  final String? prize;

  /// Default: the department bonus.
  final num? bonusCents;

  Map<String, Object?> toJson() => _$CreateRewardAwardDtoToJson(this);
}
