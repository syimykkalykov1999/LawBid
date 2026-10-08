// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'localized_text_dto.dart';
import 'plan_entitlements_dto.dart';
import 'price_discount_dto.dart';
import 'public_plan_dto_audience.dart';
import 'public_plan_dto_interval.dart';
import 'public_plan_dto_kind.dart';

part 'public_plan_dto.g.dart';

@JsonSerializable()
class PublicPlanDto {
  const PublicPlanDto({
    required this.id,
    required this.code,
    required this.audience,
    required this.kind,
    required this.name,
    required this.tagline,
    required this.description,
    required this.interval,
    required this.currency,
    required this.amountCents,
    required this.extraSeatCents,
    required this.discount,
    required this.entitlements,
    required this.highlights,
    required this.isDefault,
    required this.trialDays,
  });

  factory PublicPlanDto.fromJson(Map<String, Object?> json) =>
      _$PublicPlanDtoFromJson(json);

  final String id;
  final String code;
  final PublicPlanDtoAudience audience;
  final PublicPlanDtoKind kind;
  final LocalizedTextDto name;
  final LocalizedTextDto tagline;
  final LocalizedTextDto description;
  final PublicPlanDtoInterval? interval;
  final String currency;

  /// Price per interval; null for a baseline / no price yet.
  final int? amountCents;

  /// Price of one extra assistant seat per month (attorney plans).
  final int? extraSeatCents;

  /// Owner 2026-10-07: the strikethrough old price, or null.
  final PriceDiscountDto? discount;
  final PlanEntitlementsDto entitlements;
  final List<LocalizedTextDto> highlights;
  final bool isDefault;
  final int trialDays;

  Map<String, Object?> toJson() => _$PublicPlanDtoToJson(this);
}
