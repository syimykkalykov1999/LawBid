// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'billing_subscription_counts_dto.g.dart';

@JsonSerializable()
class BillingSubscriptionCountsDto {
  const BillingSubscriptionCountsDto({
    required this.active,
    required this.trialing,
    required this.pastDue,
    required this.monthly,
    required this.yearly,
  });

  factory BillingSubscriptionCountsDto.fromJson(Map<String, Object?> json) =>
      _$BillingSubscriptionCountsDtoFromJson(json);

  final int active;
  final int trialing;
  final int pastDue;
  final int monthly;
  final int yearly;

  Map<String, Object?> toJson() => _$BillingSubscriptionCountsDtoToJson(this);
}
