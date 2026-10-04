// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_plan_price_item_dto_interval.dart';
import 'plan_kind.dart';

part 'admin_plan_price_item_dto.g.dart';

@JsonSerializable()
class AdminPlanPriceItemDto {
  const AdminPlanPriceItemDto({
    required this.kind,
    required this.amountCents,
    required this.defaultCents,
    required this.isCustom,
    required this.interval,
    required this.stripePriceId,
    required this.subscribers,
    required this.updatedAt,
  });

  factory AdminPlanPriceItemDto.fromJson(Map<String, Object?> json) =>
      _$AdminPlanPriceItemDtoFromJson(json);

  final PlanKind kind;
  final int amountCents;

  /// Built-in default.
  final int defaultCents;

  /// false = the built-in default is used.
  final bool isCustom;
  final AdminPlanPriceItemDtoInterval interval;

  /// Stripe price of this amount for the current keys.
  final String? stripePriceId;

  /// Paying subscribers on this plan (any price).
  final int subscribers;
  final DateTime? updatedAt;

  Map<String, Object?> toJson() => _$AdminPlanPriceItemDtoToJson(this);
}
