// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_reward_department_dto_key.dart';

part 'update_reward_department_dto.g.dart';

@JsonSerializable()
class UpdateRewardDepartmentDto {
  const UpdateRewardDepartmentDto({
    required this.key,
    this.enabled,
    this.prize,
    this.bonusCents,
  });

  factory UpdateRewardDepartmentDto.fromJson(Map<String, Object?> json) =>
      _$UpdateRewardDepartmentDtoFromJson(json);

  final UpdateRewardDepartmentDtoKey key;
  final bool? enabled;
  final String? prize;
  final num? bonusCents;

  Map<String, Object?> toJson() => _$UpdateRewardDepartmentDtoToJson(this);
}
