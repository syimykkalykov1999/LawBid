// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'split_plan_dto.g.dart';

@JsonSerializable()
class SplitPlanDto {
  const SplitPlanDto({
    required this.fromDb,
    required this.toDb,
    required this.shards,
    required this.rows,
    required this.estimatedSeconds,
    required this.readiness,
  });

  factory SplitPlanDto.fromJson(Map<String, Object?> json) =>
      _$SplitPlanDtoFromJson(json);

  final String fromDb;
  final String toDb;
  final List<num> shards;
  final num rows;
  final num estimatedSeconds;

  /// DATABASE_URL_SHARDS readiness
  final dynamic readiness;

  Map<String, Object?> toJson() => _$SplitPlanDtoToJson(this);
}
