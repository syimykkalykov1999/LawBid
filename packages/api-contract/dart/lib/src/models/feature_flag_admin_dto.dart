// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'feature_flag_admin_dto.g.dart';

@JsonSerializable()
class FeatureFlagAdminDto {
  const FeatureFlagAdminDto({
    required this.key,
    required this.enabled,
    required this.rolloutPercent,
    required this.description,
    required this.paid,
    required this.requiredKeys,
    required this.missingKeys,
    required this.notBuilt,
    required this.updatedBy,
    required this.updatedAt,
  });

  factory FeatureFlagAdminDto.fromJson(Map<String, Object?> json) =>
      _$FeatureFlagAdminDtoFromJson(json);

  final String key;
  final bool enabled;
  final int rolloutPercent;
  final String? description;

  /// Uses a paid third-party service (§2.3 item 7).
  final bool paid;

  /// Provider env keys this flag needs.
  final List<String> requiredKeys;

  /// Which of them are not set on the server.
  final List<String> missingKeys;

  /// The feature is not built yet — the server refuses to enable it (409).
  final bool notBuilt;
  final String? updatedBy;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$FeatureFlagAdminDtoToJson(this);
}
