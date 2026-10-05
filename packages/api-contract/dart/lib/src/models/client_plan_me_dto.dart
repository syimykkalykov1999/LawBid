// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_subscription_dto.dart';
import 'plan_entitlements_dto.dart';
import 'public_plan_dto.dart';

part 'client_plan_me_dto.g.dart';

@JsonSerializable()
class ClientPlanMeDto {
  const ClientPlanMeDto({
    required this.subscription,
    required this.isActive,
    required this.plan,
    required this.entitlements,
    required this.plans,
    required this.trialEligible,
  });

  factory ClientPlanMeDto.fromJson(Map<String, Object?> json) =>
      _$ClientPlanMeDtoFromJson(json);

  final ClientSubscriptionDto? subscription;
  final bool isActive;
  final PublicPlanDto? plan;
  final PlanEntitlementsDto entitlements;
  final List<PublicPlanDto> plans;

  /// A first purchase of a plan with trial days gets them.
  final bool trialEligible;

  Map<String, Object?> toJson() => _$ClientPlanMeDtoToJson(this);
}
