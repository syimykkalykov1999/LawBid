// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'details_details.dart';
import 'error_error.dart';
import 'info_info.dart';
import 'terminus_health_check_result_status.dart';

part 'terminus_health_check_result.g.dart';

@JsonSerializable()
class TerminusHealthCheckResult {
  const TerminusHealthCheckResult({
    required this.status,
    required this.details,
    this.info,
    this.error,
  });

  factory TerminusHealthCheckResult.fromJson(Map<String, Object?> json) =>
      _$TerminusHealthCheckResultFromJson(json);

  final TerminusHealthCheckResultStatus status;
  final Map<String, InfoInfo>? info;
  final Map<String, ErrorError>? error;
  final Map<String, DetailsDetails> details;

  Map<String, Object?> toJson() => _$TerminusHealthCheckResultToJson(this);
}
