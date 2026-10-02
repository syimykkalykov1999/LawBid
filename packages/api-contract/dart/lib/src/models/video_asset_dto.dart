// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'video_asset_status.dart';

part 'video_asset_dto.g.dart';

@JsonSerializable()
class VideoAssetDto {
  const VideoAssetDto({
    required this.id,
    required this.status,
    this.durationSec,
    this.failureReason,
  });

  factory VideoAssetDto.fromJson(Map<String, Object?> json) =>
      _$VideoAssetDtoFromJson(json);

  final String id;
  final VideoAssetStatus status;
  final int? durationSec;
  final String? failureReason;

  Map<String, Object?> toJson() => _$VideoAssetDtoToJson(this);
}
