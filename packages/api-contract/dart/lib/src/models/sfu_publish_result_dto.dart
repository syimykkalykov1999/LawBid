// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_publish_failed_dto.dart';
import 'sfu_publish_result_dto_type.dart';
import 'sfu_published_track_dto.dart';

part 'sfu_publish_result_dto.g.dart';

@JsonSerializable()
class SfuPublishResultDto {
  const SfuPublishResultDto({
    required this.type,
    required this.sdp,
    required this.tracks,
    required this.failed,
  });

  factory SfuPublishResultDto.fromJson(Map<String, Object?> json) =>
      _$SfuPublishResultDtoFromJson(json);

  final SfuPublishResultDtoType type;

  /// Apply with setRemoteDescription.
  final String sdp;
  final List<SfuPublishedTrackDto> tracks;
  final List<SfuPublishFailedDto> failed;

  Map<String, Object?> toJson() => _$SfuPublishResultDtoToJson(this);
}
