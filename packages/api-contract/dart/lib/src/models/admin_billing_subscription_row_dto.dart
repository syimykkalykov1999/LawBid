// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'active_grant_summary_dto.dart';
import 'admin_billing_subscription_row_dto_plan.dart';
import 'admin_billing_user_dto.dart';

part 'admin_billing_subscription_row_dto.g.dart';

@JsonSerializable()
class AdminBillingSubscriptionRowDto {
  const AdminBillingSubscriptionRowDto({
    required this.id,
    required this.userId,
    required this.user,
    required this.status,
    required this.plan,
    required this.assistantSeats,
    required this.effectiveSeats,
    required this.priceCents,
    required this.monthlyEquivalentCents,
    required this.trialEndsAt,
    required this.currentPeriodEnd,
    required this.graceEndsAt,
    required this.cancelAtPeriodEnd,
    required this.stripeSubscriptionId,
    required this.stripeCustomerId,
    required this.isActive,
    required this.contractGrant,
    required this.createdAt,
  });

  factory AdminBillingSubscriptionRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminBillingSubscriptionRowDtoFromJson(json);

  final String id;
  final String userId;
  final AdminBillingUserDto? user;
  final String status;
  final AdminBillingSubscriptionRowDtoPlan plan;

  /// Paid seats.
  final int assistantSeats;

  /// max(paid seats, active grant seats).
  final int effectiveSeats;
  final int priceCents;

  /// Monthly value of the plan (yearly / 12).
  final int monthlyEquivalentCents;
  final DateTime? trialEndsAt;
  final DateTime? currentPeriodEnd;
  final DateTime? graceEndsAt;
  final bool cancelAtPeriodEnd;
  final String? stripeSubscriptionId;
  final String? stripeCustomerId;

  /// Stripe row active, or an active grant.
  final bool isActive;
  final ActiveGrantSummaryDto? contractGrant;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminBillingSubscriptionRowDtoToJson(this);
}
