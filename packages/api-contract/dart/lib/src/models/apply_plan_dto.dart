// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'apply_plan_dto.g.dart';

@JsonSerializable()
class ApplyPlanDto {
  const ApplyPlanDto({required this.reason});

  factory ApplyPlanDto.fromJson(Map<String, Object?> json) =>
      _$ApplyPlanDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$ApplyPlanDtoToJson(this);
}
