// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_mode.dart';
import 'case_deadline_kind.dart';
import 'case_state_dto.dart';
import 'case_status.dart';
import 'case_urgency.dart';
import 'case_urgency_level.dart';
import 'practice_area_ref_dto.dart';

part 'case_dto.g.dart';

@JsonSerializable()
class CaseDto {
  const CaseDto({
    required this.status,
    required this.title,
    required this.description,
    required this.privateDetails,
    required this.practiceArea,
    required this.extraPracticeAreas,
    required this.primaryStateCode,
    required this.states,
    required this.budgetMode,
    required this.id,
    required this.stillNeededPending,
    required this.createdAt,
    required this.canMakeNotUrgent,
    required this.version,
    required this.bidsCount,
    required this.viewCount,
    required this.lastActivityAt,
    this.deadlineKind,
    this.deadlineAt,
    this.urgencyLevel,
    this.urgency,
    this.budgetPercentBps,
    this.archivesAt,
    this.archivedAt,
    this.clientCompletedAt,
    this.attorneyConfirmedAt,
    this.autoCloseAt,
    this.closedAt,
    this.deletedAt,
    this.stalePromptSentAt,
    this.pausedAt,
    this.budgetCents,
    this.city,
    this.hidesAt,
    this.coverKey,
  });

  factory CaseDto.fromJson(Map<String, Object?> json) =>
      _$CaseDtoFromJson(json);

  final String id;
  final String title;
  final String description;

  /// Owner 2026-10-18: the private details — only for the owner and the accepted attorney.
  final String? privateDetails;
  final PracticeAreaRefDto practiceArea;

  /// Topics 2..N of the case (owner 2026-10-15).
  final List<PracticeAreaRefDto> extraPracticeAreas;
  final String primaryStateCode;
  final List<CaseStateDto> states;
  final String? city;
  final BudgetMode budgetMode;
  final int? budgetCents;

  /// Owner 2026-10-17: budgetMode = percent → basis points.
  final int? budgetPercentBps;

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
  final CaseStatus status;
  final int viewCount;
  final int bidsCount;

  /// Send it back as `If-Match` on an edit to detect a concurrent save (409 STALE_VERSION).
  final int version;
  final String createdAt;
  final String lastActivityAt;
  final String? archivedAt;
  final String? clientCompletedAt;
  final String? attorneyConfirmedAt;
  final String? autoCloseAt;
  final String? closedAt;
  final String? deletedAt;

  /// §10.2 "Is this case still relevant?" prompt time, else null. Set while.
  /// the prompt is pending; POST /cases/:id/keep-alive clears it.
  final String? stalePromptSentAt;

  /// OQ-054: set when the case was paused (hidden from the attorneys' feed.
  /// and search): the client's screens show «Кейс скрыт · Вернуть».
  final String? pausedAt;

  /// OQ-054: «Вам ещё нужен адвокат?» is waiting for an answer.
  final bool stillNeededPending;

  /// OQ-054: «Сменить на «Не срочно»» is offered (urgent / very urgent.
  /// and older than 7 days).
  final bool canMakeNotUrgent;

  /// OQ-054: when the unanswered question hides the case from the.
  /// attorneys' feed (null = no question waiting).
  final String? hidesAt;

  /// OQ-054: when a paused case moves to the archive (null = not paused).
  final String? archivesAt;

  Map<String, Object?> toJson() => _$CaseDtoToJson(this);
}
