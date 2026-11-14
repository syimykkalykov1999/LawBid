// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_video_status.dart';

part 'admin_videos_filter_dto.g.dart';

@JsonSerializable()
class AdminVideosFilterDto {
  const AdminVideosFilterDto({this.status, this.ownerId, this.from, this.to});

  factory AdminVideosFilterDto.fromJson(Map<String, Object?> json) =>
      _$AdminVideosFilterDtoFromJson(json);

  final AdminVideoStatus? status;
  final String? ownerId;

  /// Uploaded at or after (inclusive).
  final DateTime? from;

  /// Uploaded before (exclusive).
  final DateTime? to;

  Map<String, Object?> toJson() => _$AdminVideosFilterDtoToJson(this);
}
