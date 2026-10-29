// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contract_grant_info_dto.dart';
import 'plan_entitlements_dto.dart';
import 'plan_prices_dto.dart';
import 'public_plan_dto.dart';
import 'seat_change_result.dart';
import 'seat_summary_dto.dart';
import 'subscription_dto.dart';
import 'subscription_me_dto.dart';

part 'seat_change_result_dto.g.dart';

@JsonSerializable()
class SeatChangeResultDto {
  const SeatChangeResultDto({
    required this.subscription,
    required this.contractGrant,
    required this.prices,
    required this.isActive,
    required this.canStart,
    required this.trialEligible,
    required this.priceCents,
    required this.plan,
    required this.plans,
    required this.entitlements,
    required this.seats,
    required this.status,
    required this.clientSecret,
    required this.amountCents,
    required this.currency,
    required this.effectiveAt,
    required this.changeId,
    required this.overview,
  });
  
  factory SeatChangeResultDto.fromJson(Map<String, Object?> json) => _$SeatChangeResultDtoFromJson(json);
  
  final SubscriptionDto? subscription;

  /// An active free subscription under a contract (isActive is true while it runs).
  final ContractGrantInfoDto? contractGrant;
  final PlanPricesDto prices;
  final bool isActive;

  /// Verified attorney without a live subscription may start.
  final bool canStart;
  final bool trialEligible;
  final int priceCents;
  final PublicPlanDto? plan;
  final List<PublicPlanDto> plans;
  final PlanEntitlementsDto entitlements;
  final SeatSummaryDto? seats;

  /// applied = paid and usable now; requires_action = confirm the payment (3-D Secure) with clientSecret, then GET /subscriptions/me; failed = the card was declined, nothing changed; scheduled = fewer seats from effectiveAt (the period end), no refund.
  final SeatChangeResult status;

  /// The PaymentIntent's client secret (requires_action only).
  final String? clientSecret;
  final int amountCents;
  final String currency;
  final DateTime? effectiveAt;
  final String? changeId;
  final SubscriptionMeDto overview;

  Map<String, Object?> toJson() => _$SeatChangeResultDtoToJson(this);
}
