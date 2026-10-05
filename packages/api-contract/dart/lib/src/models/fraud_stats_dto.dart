// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'fraud_stats_dto.g.dart';

@JsonSerializable()
class FraudStatsDto {
  const FraudStatsDto({
    required this.enabled,
    required this.auto,
    required this.review,
    required this.restricted,
    required this.banned,
    required this.blockedSignIns30d,
    required this.autoBanned30d,
  });

  factory FraudStatsDto.fromJson(Map<String, Object?> json) =>
      _$FraudStatsDtoFromJson(json);

  final bool enabled;
  final bool auto;

  /// Waiting for a check (account works).
  final num review;

  /// Restricted until a check.
  final num restricted;

  /// Blocked by this module (all time).
  final num banned;

  /// Sign-ins of blocked people refused, 30 days.
  final num blockedSignIns30d;

  /// Accounts blocked automatically, 30 days.
  final num autoBanned30d;

  Map<String, Object?> toJson() => _$FraudStatsDtoToJson(this);
}
