// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'crash_report_in_dto.g.dart';

@JsonSerializable()
class CrashReportInDto {
  const CrashReportInDto({
    required this.message,
    required this.stack,
    required this.platform,
    required this.appVersion,
    required this.build,
    required this.flavor,
    required this.osVersion,
    required this.deviceModel,
    this.fatal,
    this.route,
  });

  factory CrashReportInDto.fromJson(Map<String, Object?> json) =>
      _$CrashReportInDtoFromJson(json);

  /// The error as text (type and message).
  final String message;
  final String stack;
  final bool? fatal;
  final String platform;
  final String appVersion;
  final String build;
  final String flavor;
  final String osVersion;
  final String deviceModel;

  /// The screen the person was on.
  final String? route;

  Map<String, Object?> toJson() => _$CrashReportInDtoToJson(this);
}
