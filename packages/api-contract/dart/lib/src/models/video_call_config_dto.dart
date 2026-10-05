// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'video_call_config_dto_provider.dart';
import 'video_call_unavailable_reason.dart';

part 'video_call_config_dto.g.dart';

@JsonSerializable()
class VideoCallConfigDto {
  const VideoCallConfigDto({
    required this.available,
    required this.provider,
    this.reason,
  });

  factory VideoCallConfigDto.fromJson(Map<String, Object?> json) =>
      _$VideoCallConfigDtoFromJson(json);

  final bool available;
  final VideoCallConfigDtoProvider provider;

  /// Why not (null when available).
  final VideoCallUnavailableReason? reason;

  Map<String, Object?> toJson() => _$VideoCallConfigDtoToJson(this);
}
