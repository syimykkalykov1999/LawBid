// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_stats_row_dto.g.dart';

@JsonSerializable()
class HotlineStatsRowDto {
  const HotlineStatsRowDto({required this.key, required this.calls});

  factory HotlineStatsRowDto.fromJson(Map<String, Object?> json) =>
      _$HotlineStatsRowDtoFromJson(json);

  final String key;
  final num calls;

  Map<String, Object?> toJson() => _$HotlineStatsRowDtoToJson(this);
}
