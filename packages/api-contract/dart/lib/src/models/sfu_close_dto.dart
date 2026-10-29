// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_close_dto_track_names.dart';

part 'sfu_close_dto.g.dart';

@JsonSerializable()
class SfuCloseDto {
  const SfuCloseDto({
    this.trackNames,
    this.userIds,
    this.sdp,
  });
  
  factory SfuCloseDto.fromJson(Map<String, Object?> json) => _$SfuCloseDtoFromJson(json);
  
  /// Stop publishing these of your own tracks.
  final List<SfuCloseDtoTrackNames>? trackNames;

  /// Stop receiving these people (a person who left).
  final List<String>? userIds;

  /// Your SDP offer after you stopped the transceivers of `userIds`; the answer comes back. Without it the tracks are force-closed.
  final String? sdp;

  Map<String, Object?> toJson() => _$SfuCloseDtoToJson(this);
}
