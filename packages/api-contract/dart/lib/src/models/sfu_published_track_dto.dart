// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_published_track_dto_track_name.dart';

part 'sfu_published_track_dto.g.dart';

@JsonSerializable()
class SfuPublishedTrackDto {
  const SfuPublishedTrackDto({required this.mid, required this.trackName});

  factory SfuPublishedTrackDto.fromJson(Map<String, Object?> json) =>
      _$SfuPublishedTrackDtoFromJson(json);

  final String mid;
  final SfuPublishedTrackDtoTrackName trackName;

  Map<String, Object?> toJson() => _$SfuPublishedTrackDtoToJson(this);
}
