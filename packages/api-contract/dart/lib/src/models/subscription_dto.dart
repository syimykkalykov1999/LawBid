// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'subscription_dto_status.dart';

part 'subscription_dto.g.dart';

@JsonSerializable()
class SubscriptionDto {
  const SubscriptionDto({
    required this.id,
    required this.status,
    required this.isActive,
    required this.priceCents,
    required this.trialEndsAt,
    required this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    required this.canceledAt,
    required this.graceEndsAt,
    required this.createdAt,
  });

  factory SubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$SubscriptionDtoFromJson(json);

  final String id;
  final SubscriptionDtoStatus status;

  /// docs/06 §1.2 verdict (trial / active / grace).
  final bool isActive;
  final int priceCents;
  final DateTime? trialEndsAt;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final DateTime? canceledAt;

  /// past_due grace deadline.
  final DateTime? graceEndsAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$SubscriptionDtoToJson(this);
}
