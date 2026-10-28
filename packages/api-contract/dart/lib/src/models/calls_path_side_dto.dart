// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calls_path_check_dto.dart';

part 'calls_path_side_dto.g.dart';

@JsonSerializable()
class CallsPathSideDto {
  const CallsPathSideDto({
    required this.configured,
    required this.parts,
    required this.lastProbeAt,
    required this.lastProbeOk,
    required this.check,
  });

  factory CallsPathSideDto.fromJson(Map<String, Object?> json) =>
      _$CallsPathSideDtoFromJson(json);

  final bool configured;

  /// Which parts have keys (turn / sfu / livekit).
  final Map<String, bool> parts;
  final DateTime? lastProbeAt;
  final bool? lastProbeOk;
  final CallsPathCheckDto? check;

  Map<String, Object?> toJson() => _$CallsPathSideDtoToJson(this);
}
