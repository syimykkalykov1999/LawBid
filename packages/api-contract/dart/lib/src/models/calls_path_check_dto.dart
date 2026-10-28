// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calls_path_step_dto.dart';

part 'calls_path_check_dto.g.dart';

@JsonSerializable()
class CallsPathCheckDto {
  const CallsPathCheckDto({
    required this.at,
    required this.ok,
    required this.ms,
    required this.stun,
    required this.turn,
    required this.media,
    required this.error,
  });

  factory CallsPathCheckDto.fromJson(Map<String, Object?> json) =>
      _$CallsPathCheckDtoFromJson(json);

  final DateTime at;
  final bool ok;

  /// Whole check, ms.
  final int ms;
  final CallsPathStepDto? stun;
  final CallsPathStepDto? turn;

  /// Cloudflare SFU session / LiveKit connect.
  final CallsPathStepDto? media;
  final String? error;

  Map<String, Object?> toJson() => _$CallsPathCheckDtoToJson(this);
}
