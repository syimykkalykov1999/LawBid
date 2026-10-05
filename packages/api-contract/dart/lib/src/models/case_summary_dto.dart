// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_mode.dart';
import 'case_deadline_kind.dart';
import 'case_status.dart';
import 'case_urgency.dart';
import 'case_urgency_level.dart';
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
    this.coverKey,
    this.urgency,
    this.urgencyLevel,
    this.deadlineAt,
    this.deadlineKind,
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

  /// Owner 2026-10-04: `art:0..3` / `icon:<name>`; null = from the id.
  final String? coverKey;

  /// Owner 2026-10-04/05: the client's choice — a level, or `by_date`.
  /// (see deadlineAt); null when not set.
  final CaseUrgency? urgency;

  /// Owner 2026-10-05: the level the case reads as today (a dated case's.
  /// level follows from the days left; `overdue` once the date passed).
  final CaseUrgencyLevel? urgencyLevel;

  /// Owner 2026-10-05: the date the client needs it by (YYYY-MM-DD).
  final DateTime? deadlineAt;

  /// Owner 2026-10-05: what the date is (court hearing, filing…).
  final CaseDeadlineKind? deadlineKind;
  final int bidsCount;
  final String createdAt;
  final String lastActivityAt;

  Map<String, Object?> toJson() => _$CaseSummaryDtoToJson(this);
}
