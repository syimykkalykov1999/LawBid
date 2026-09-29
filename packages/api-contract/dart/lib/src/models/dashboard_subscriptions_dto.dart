// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dashboard_subscriptions_dto.g.dart';

@JsonSerializable()
class DashboardSubscriptionsDto {
  const DashboardSubscriptionsDto({
    required this.trialing,
    required this.active,
    required this.pastDue,
    required this.revenueEstimateUsd,
  });

  factory DashboardSubscriptionsDto.fromJson(Map<String, Object?> json) =>
      _$DashboardSubscriptionsDtoFromJson(json);

  final int trialing;
  final int active;
  final int pastDue;

  /// active × price (USD).
  final int revenueEstimateUsd;

  Map<String, Object?> toJson() => _$DashboardSubscriptionsDtoToJson(this);
}
