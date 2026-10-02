// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contract_grant_info_dto.dart';
import 'plan_prices_dto.dart';
import 'subscription_dto.dart';

part 'subscription_me_dto.g.dart';

@JsonSerializable()
class SubscriptionMeDto {
  const SubscriptionMeDto({
    required this.subscription,
    required this.contractGrant,
    required this.prices,
    required this.isActive,
    required this.canStart,
    required this.trialEligible,
    required this.priceCents,
  });

  factory SubscriptionMeDto.fromJson(Map<String, Object?> json) =>
      _$SubscriptionMeDtoFromJson(json);

  final SubscriptionDto? subscription;

  /// An active free subscription under a contract (isActive is true while it runs).
  final ContractGrantInfoDto? contractGrant;
  final PlanPricesDto prices;
  final bool isActive;

  /// Verified attorney without a live subscription may start.
  final bool canStart;
  final bool trialEligible;
  final int priceCents;

  Map<String, Object?> toJson() => _$SubscriptionMeDtoToJson(this);
}
