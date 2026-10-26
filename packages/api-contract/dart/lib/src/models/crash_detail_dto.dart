// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'crash_count_dto.dart';
import 'crash_instance_dto.dart';

part 'crash_detail_dto.g.dart';

@JsonSerializable()
class CrashDetailDto {
  const CrashDetailDto({
    required this.fingerprint,
    required this.message,
    required this.stack,
    required this.versions,
    required this.systems,
    required this.devices,
    required this.latest,
  });

  factory CrashDetailDto.fromJson(Map<String, Object?> json) =>
      _$CrashDetailDtoFromJson(json);

  final String fingerprint;
  final String message;
  final String stack;
  final List<CrashCountDto> versions;
  final List<CrashCountDto> systems;
  final List<CrashCountDto> devices;
  final List<CrashInstanceDto> latest;

  Map<String, Object?> toJson() => _$CrashDetailDtoToJson(this);
}
