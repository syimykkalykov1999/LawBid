// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'error_code.dart';

part 'error_body_dto.g.dart';

@JsonSerializable()
class ErrorBodyDto {
  const ErrorBodyDto({
    required this.code,
    required this.message,
    required this.requestId,
    this.details,
  });

  factory ErrorBodyDto.fromJson(Map<String, Object?> json) =>
      _$ErrorBodyDtoFromJson(json);

  final ErrorCode code;

  /// Human-readable, not localized and not stable — never branch on it.
  final String message;

  /// Code-specific context, e.g. `validation` (VALIDATION_ERROR) or `missing` (CLIENT_CONTACTS_INCOMPLETE).
  final dynamic details;

  /// X-Request-Id of the failed request.
  final String requestId;

  Map<String, Object?> toJson() => _$ErrorBodyDtoToJson(this);
}
