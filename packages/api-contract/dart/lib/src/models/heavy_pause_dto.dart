// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'heavy_pause_dto_by.dart';

part 'heavy_pause_dto.g.dart';

@JsonSerializable()
class HeavyPauseDto {
  const HeavyPauseDto({
    required this.by,
    required this.at,
    required this.reason,
  });

  factory HeavyPauseDto.fromJson(Map<String, Object?> json) =>
      _$HeavyPauseDtoFromJson(json);

  final HeavyPauseDtoBy by;
  final String at;
  final String reason;

  Map<String, Object?> toJson() => _$HeavyPauseDtoToJson(this);
}
