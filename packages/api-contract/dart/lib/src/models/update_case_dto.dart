// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_mode.dart';
import 'case_urgency.dart';

part 'update_case_dto.g.dart';

@JsonSerializable()
class UpdateCaseDto {
  const UpdateCaseDto({
    this.title,
    this.description,
    this.practiceAreaId,
    this.primaryStateCode,
    this.additionalStateCodes,
    this.city,
    this.budgetMode,
    this.budgetAmountDollars,
    this.coverKey,
    this.urgency,
    this.photoFileIds,
  });

  factory UpdateCaseDto.fromJson(Map<String, Object?> json) =>
      _$UpdateCaseDtoFromJson(json);

  final String? title;
  final String? description;

  /// A leaf (specialization).
  final String? practiceAreaId;
  final String? primaryStateCode;
  final List<String>? additionalStateCodes;
  final String? city;
  final BudgetMode? budgetMode;
  final int? budgetAmountDollars;

  /// `art:0`-`art:3` (practice cover variant) or `icon:<name>`.
  final String? coverKey;

  /// Owner 2026-10-04: how soon the client needs an attorney.
  final CaseUrgency? urgency;

  /// Full set of clean case_photo / case_attachment file ids (0-9), display order.
  final List<String>? photoFileIds;

  Map<String, Object?> toJson() => _$UpdateCaseDtoToJson(this);
}
