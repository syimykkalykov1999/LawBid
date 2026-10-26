// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_media_fallback_dto_reason.dart';

part 'call_media_fallback_dto.g.dart';

@JsonSerializable()
class CallMediaFallbackDto {
  const CallMediaFallbackDto({
    required this.active,
    required this.reason,
    required this.videoBlocked,
    required this.videoMaxParticipants,
  });

  factory CallMediaFallbackDto.fromJson(Map<String, Object?> json) =>
      _$CallMediaFallbackDtoFromJson(json);

  /// true: Cloudflare was chosen but this call runs device to device because it was down or unconfigured at its start.
  final bool active;
  final CallMediaFallbackDtoReason? reason;

  /// true: more people are in the call than the threshold (calls.sfu_fallback_mesh_max, 4), so the camera cannot be switched on. When the person taps video/camera, show «На сервере идут работы. Видео можно будет включить примерно через час.» instead.
  final bool videoBlocked;

  /// The threshold (default 4).
  final num videoMaxParticipants;

  Map<String, Object?> toJson() => _$CallMediaFallbackDtoToJson(this);
}
