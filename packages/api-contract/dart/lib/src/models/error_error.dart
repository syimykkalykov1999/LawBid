// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'terminus_health_indicator_result.dart';
import 'terminus_health_indicator_result_status.dart';

part 'error_error.g.dart';

@JsonSerializable()
class ErrorError {
  const ErrorError({
    required this.status,
    this.responseTime,
    this.cachedResponse,
  });

  factory ErrorError.fromJson(Map<String, Object?> json) =>
      _$ErrorErrorFromJson(json);

  /// The status of this health indicator
  final TerminusHealthIndicatorResultStatus status;

  /// Time the health indicator took to respond, in ms
  final num? responseTime;

  /// Whether this result was served from the cache
  final bool? cachedResponse;

  Map<String, Object?> toJson() => _$ErrorErrorToJson(this);
}
