// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'apply_plan_result_dto.g.dart';

@JsonSerializable()
class ApplyPlanResultDto {
  const ApplyPlanResultDto({required this.updated});

  factory ApplyPlanResultDto.fromJson(Map<String, Object?> json) =>
      _$ApplyPlanResultDtoFromJson(json);

  final int updated;

  Map<String, Object?> toJson() => _$ApplyPlanResultDtoToJson(this);
}
