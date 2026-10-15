// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'analytics_day_dto.g.dart';

@JsonSerializable()
class AnalyticsDayDto {
  const AnalyticsDayDto({
    required this.day,
    required this.active,
    required this.signups,
    required this.subscriptionCents,
    required this.boostCents,
    required this.purchases,
  });

  factory AnalyticsDayDto.fromJson(Map<String, Object?> json) =>
      _$AnalyticsDayDtoFromJson(json);

  final String day;

  /// People who opened the app.
  final num active;
  final num signups;
  final num subscriptionCents;
  final num boostCents;

  /// Subscription payments and Boosts bought.
  final num purchases;

  Map<String, Object?> toJson() => _$AnalyticsDayDtoToJson(this);
}
