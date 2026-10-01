// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_mode.dart';
import 'case_status.dart';
import 'practice_area_ref_dto.dart';

part 'case_summary_dto.g.dart';

@JsonSerializable()
class CaseSummaryDto {
  const CaseSummaryDto({
    required this.id,
    required this.title,
    required this.practiceArea,
    required this.primaryStateCode,
    required this.additionalStateCount,
    required this.status,
    required this.budgetMode,
    required this.bidsCount,
    required this.createdAt,
    required this.lastActivityAt,
    this.coverUrl,
    this.city,
    this.budgetCents,
  });

  factory CaseSummaryDto.fromJson(Map<String, Object?> json) =>
      _$CaseSummaryDtoFromJson(json);

  final String id;

  /// Owner 2026-09-30: the first photo (the "Mine" grid), else null.
  final String? coverUrl;
  final String title;
  final PracticeAreaRefDto practiceArea;
  final String primaryStateCode;

  /// States besides the primary.
  final int additionalStateCount;
  final String? city;
  final CaseStatus status;
  final BudgetMode budgetMode;
  final int? budgetCents;
  final int bidsCount;
  final String createdAt;
  final String lastActivityAt;

  Map<String, Object?> toJson() => _$CaseSummaryDtoToJson(this);
}
