// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_video_status_count_dto.dart';

part 'admin_video_stats_dto.g.dart';

@JsonSerializable()
class AdminVideoStatsDto {
  const AdminVideoStatsDto({
    required this.byStatus,
    required this.storageBytes,
    required this.uploads7d,
    required this.failed7d,
  });

  factory AdminVideoStatsDto.fromJson(Map<String, Object?> json) =>
      _$AdminVideoStatsDtoFromJson(json);

  final List<AdminVideoStatusCountDto> byStatus;

  /// Bunny storage of live ready videos, bytes.
  final int storageBytes;
  final int uploads7d;
  final int failed7d;

  Map<String, Object?> toJson() => _$AdminVideoStatsDtoToJson(this);
}
