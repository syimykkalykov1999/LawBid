// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_plan_dto_audience.dart';
import 'admin_plan_dto_interval.dart';
import 'admin_plan_dto_kind.dart';
import 'admin_plan_dto_status.dart';
import 'localized_text_dto.dart';
import 'plan_entitlements_dto.dart';

part 'admin_plan_dto.g.dart';

@JsonSerializable()
class AdminPlanDto {
  const AdminPlanDto({
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
    required this.entitlements,
    required this.highlights,
    required this.isDefault,
    required this.trialDays,
    required this.status,
    required this.sort,
    required this.subscribers,
    required this.stripePriceId,
    required this.priceKind,
    required this.updatedAt,
  });

  factory AdminPlanDto.fromJson(Map<String, Object?> json) =>
      _$AdminPlanDtoFromJson(json);

  final String id;
  final String code;
  final AdminPlanDtoAudience audience;
  final AdminPlanDtoKind kind;
  final LocalizedTextDto name;
  final LocalizedTextDto tagline;
  final LocalizedTextDto description;
  final AdminPlanDtoInterval? interval;
  final String currency;

  /// Price per interval; null for a baseline / no price yet.
  final int? amountCents;

  /// Price of one extra assistant seat per month (attorney plans).
  final int? extraSeatCents;
  final PlanEntitlementsDto entitlements;
  final List<LocalizedTextDto> highlights;
  final bool isDefault;
  final int trialDays;
  final AdminPlanDtoStatus status;
  final int sort;

  /// Live subscribers on this plan (pre-plan rows count for the default plan).
  final int subscribers;
  final String? stripePriceId;
  final String? priceKind;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$AdminPlanDtoToJson(this);
}
