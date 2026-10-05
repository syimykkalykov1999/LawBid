// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'start_call_dto.g.dart';

@JsonSerializable()
class StartCallDto {
  const StartCallDto({this.video = false});

  factory StartCallDto.fromJson(Map<String, Object?> json) =>
      _$StartCallDtoFromJson(json);

  /// A video call (needs the `video_calls` flag).
  final bool video;

  Map<String, Object?> toJson() => _$StartCallDtoToJson(this);
}
