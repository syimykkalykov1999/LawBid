// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'crash_group_dto.g.dart';

@JsonSerializable()
class CrashGroupDto {
  const CrashGroupDto({
    required this.fingerprint,
    required this.message,
    required this.count,
    required this.devices,
    required this.fatal,
    required this.versions,
    required this.firstAt,
    required this.lastAt,
  });

  factory CrashGroupDto.fromJson(Map<String, Object?> json) =>
      _$CrashGroupDtoFromJson(json);

  final String fingerprint;
  final String message;
  final num count;

  /// Different phones (people) it hit.
  final num devices;

  /// Of them the app closed.
  final num fatal;
  final List<String> versions;
  final String firstAt;
  final String lastAt;

  Map<String, Object?> toJson() => _$CrashGroupDtoToJson(this);
}
