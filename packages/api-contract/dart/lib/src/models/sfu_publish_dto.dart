// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_publish_track_dto.dart';

part 'sfu_publish_dto.g.dart';

@JsonSerializable()
class SfuPublishDto {
  const SfuPublishDto({
    required this.sdp,
    required this.tracks,
  });
  
  factory SfuPublishDto.fromJson(Map<String, Object?> json) => _$SfuPublishDtoFromJson(json);
  
  /// Your SDP offer (sendonly transceivers).
  final String sdp;
  final List<SfuPublishTrackDto> tracks;

  Map<String, Object?> toJson() => _$SfuPublishDtoToJson(this);
}
