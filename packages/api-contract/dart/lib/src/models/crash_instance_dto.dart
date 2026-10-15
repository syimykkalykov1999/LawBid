// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'crash_instance_dto.g.dart';

@JsonSerializable()
class CrashInstanceDto {
  const CrashInstanceDto({
    required this.at,
    required this.appVersion,
    required this.build,
    required this.flavor,
    required this.platform,
    required this.osVersion,
    required this.deviceModel,
    required this.fatal,
    this.route,
  });

  factory CrashInstanceDto.fromJson(Map<String, Object?> json) =>
      _$CrashInstanceDtoFromJson(json);

  final String at;
  final String appVersion;
  final String build;
  final String flavor;
  final String platform;
  final String osVersion;
  final String deviceModel;
  final String? route;
  final bool fatal;

  Map<String, Object?> toJson() => _$CrashInstanceDtoToJson(this);
}
