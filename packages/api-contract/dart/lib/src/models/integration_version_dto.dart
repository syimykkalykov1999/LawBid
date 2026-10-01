// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'integration_version_dto_status.dart';

part 'integration_version_dto.g.dart';

@JsonSerializable()
class IntegrationVersionDto {
  const IntegrationVersionDto({
    required this.id,
    required this.version,
    required this.status,
    required this.masked,
    required this.fingerprint,
    required this.createdAt,
    this.activatedAt,
    this.lastTestAt,
    this.lastTestOk,
    this.lastTestError,
  });

  factory IntegrationVersionDto.fromJson(Map<String, Object?> json) =>
      _$IntegrationVersionDtoFromJson(json);

  final String id;
  final num version;
  final IntegrationVersionDtoStatus status;

  /// Public values in full; secrets as ••••last4.
  final Map<String, String> masked;
  final String fingerprint;
  final String createdAt;
  final String? activatedAt;
  final String? lastTestAt;
  final bool? lastTestOk;
  final String? lastTestError;

  Map<String, Object?> toJson() => _$IntegrationVersionDtoToJson(this);
}
