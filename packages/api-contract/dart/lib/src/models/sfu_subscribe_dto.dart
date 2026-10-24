// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_subscribe_dto_rid.dart';
import 'sfu_subscribe_dto_track_names.dart';

part 'sfu_subscribe_dto.g.dart';

@JsonSerializable()
class SfuSubscribeDto {
  const SfuSubscribeDto({this.userIds, this.trackNames, this.rid});

  factory SfuSubscribeDto.fromJson(Map<String, Object?> json) =>
      _$SfuSubscribeDtoFromJson(json);

  /// People to receive; empty = everybody in the call.
  final List<String>? userIds;
  final List<SfuSubscribeDtoTrackNames>? trackNames;

  /// Simulcast layer of the video: full, half, quarter.
  final SfuSubscribeDtoRid? rid;

  Map<String, Object?> toJson() => _$SfuSubscribeDtoToJson(this);
}
