// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scale_extras_dto_db_autoscale.dart';
import 'scale_extras_dto_redis_autoscale.dart';

part 'scale_extras_dto.g.dart';

@JsonSerializable()
class ScaleExtrasDto {
  const ScaleExtrasDto({
    required this.dbAutoscale,
    required this.redisAutoscale,
    required this.poolerEnabled,
    required this.poolerMinTasks,
    required this.poolerMaxTasks,
    required this.searchEngine,
  });

  factory ScaleExtrasDto.fromJson(Map<String, Object?> json) =>
      _$ScaleExtrasDtoFromJson(json);

  /// Does the database change size by itself (Terraform switch).
  final ScaleExtrasDtoDbAutoscale dbAutoscale;
  final ScaleExtrasDtoRedisAutoscale redisAutoscale;

  /// Our own PgBouncer sits in front of the database.
  final bool poolerEnabled;
  final num? poolerMinTasks;
  final num? poolerMaxTasks;

  /// The `search.engine` setting (postgres until another is set).
  final String searchEngine;

  Map<String, Object?> toJson() => _$ScaleExtrasDtoToJson(this);
}
