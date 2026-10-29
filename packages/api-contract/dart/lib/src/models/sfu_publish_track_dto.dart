// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_publish_track_dto_track_name.dart';

part 'sfu_publish_track_dto.g.dart';

@JsonSerializable()
class SfuPublishTrackDto {
  const SfuPublishTrackDto({
    required this.mid,
    required this.trackName,
  });
  
  factory SfuPublishTrackDto.fromJson(Map<String, Object?> json) => _$SfuPublishTrackDtoFromJson(json);
  
  /// Transceiver mid in your offer.
  final String mid;
  final SfuPublishTrackDtoTrackName trackName;

  Map<String, Object?> toJson() => _$SfuPublishTrackDtoToJson(this);
}
