// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'heavy_jobs_dto.g.dart';

@JsonSerializable()
class HeavyJobsDto {
  const HeavyJobsDto({required this.paused});

  factory HeavyJobsDto.fromJson(Map<String, Object?> json) =>
      _$HeavyJobsDtoFromJson(json);

  final bool paused;

  Map<String, Object?> toJson() => _$HeavyJobsDtoToJson(this);
}
