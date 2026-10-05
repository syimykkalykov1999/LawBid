// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'entitlement_def_dto.dart';
import 'localized_text_dto.dart';
import 'my_entitlements_dto_audience.dart';
import 'my_entitlements_dto_source.dart';
import 'plan_entitlements_dto.dart';
import 'seat_summary_dto.dart';

part 'my_entitlements_dto.g.dart';

@JsonSerializable()
class MyEntitlementsDto {
  const MyEntitlementsDto({
    required this.audience,
    required this.source,
    required this.planId,
    required this.planCode,
    required this.planName,
    required this.planHighlights,
    required this.isPaid,
    required this.values,
    required this.seats,
    required this.catalog,
  });

  factory MyEntitlementsDto.fromJson(Map<String, Object?> json) =>
      _$MyEntitlementsDtoFromJson(json);

  final MyEntitlementsDtoAudience audience;
  final MyEntitlementsDtoSource source;
  final String? planId;
  final String? planCode;
  final LocalizedTextDto planName;
  final List<LocalizedTextDto> planHighlights;
  final bool isPaid;
  final PlanEntitlementsDto values;
  final SeatSummaryDto? seats;
  final List<EntitlementDefDto> catalog;

  Map<String, Object?> toJson() => _$MyEntitlementsDtoToJson(this);
}
