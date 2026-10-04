// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'plan_kind.dart';

part 'admin_plan_price_history_dto.g.dart';

@JsonSerializable()
class AdminPlanPriceHistoryDto {
  const AdminPlanPriceHistoryDto({
    required this.id,
    required this.kind,
    required this.amountCents,
    required this.active,
    required this.note,
    required this.createdBy,
    required this.createdAt,
  });

  factory AdminPlanPriceHistoryDto.fromJson(Map<String, Object?> json) =>
      _$AdminPlanPriceHistoryDtoFromJson(json);

  final String id;
  final PlanKind kind;
  final int amountCents;
  final bool active;
  final String? note;
  final String? createdBy;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminPlanPriceHistoryDtoToJson(this);
}
