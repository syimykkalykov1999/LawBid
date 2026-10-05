// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_mode.dart';
import 'case_bid_item_dto.dart';
import 'case_deadline_kind.dart';
import 'case_photo_dto.dart';
import 'case_state_dto.dart';
import 'case_status.dart';
import 'case_urgency.dart';
import 'case_urgency_level.dart';
import 'practice_area_ref_dto.dart';

part 'owner_case_detail_dto.g.dart';

@JsonSerializable()
class OwnerCaseDetailDto {
  const OwnerCaseDetailDto({
    required this.id,
    required this.title,
    required this.description,
    required this.practiceArea,
    required this.primaryStateCode,
    required this.states,
    required this.budgetMode,
    required this.status,
    required this.viewCount,
    required this.bidsCount,
    required this.createdAt,
    required this.lastActivityAt,
    required this.photos,
    this.city,
    this.budgetCents,
    this.coverKey,
    this.urgency,
    this.urgencyLevel,
    this.deadlineAt,
    this.deadlineKind,
    this.archivedAt,
    this.clientCompletedAt,
    this.attorneyConfirmedAt,
    this.autoCloseAt,
    this.closedAt,
    this.deletedAt,
    this.stalePromptSentAt,
    this.acceptedBid,
    this.conversationId,
  });

  factory OwnerCaseDetailDto.fromJson(Map<String, Object?> json) =>
      _$OwnerCaseDetailDtoFromJson(json);

  final String id;
  final String title;
  final String description;
  final PracticeAreaRefDto practiceArea;
  final String primaryStateCode;
  final List<CaseStateDto> states;
  final String? city;
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
  final CaseStatus status;
  final int viewCount;
  final int bidsCount;
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
  final CaseBidItemDto? acceptedBid;

  /// Chat with the accepted attorney (docs/05).
  final String? conversationId;

  /// OQ-031: the case photos (owner always sees them).
  final List<CasePhotoDto> photos;

  Map<String, Object?> toJson() => _$OwnerCaseDetailDtoToJson(this);
}
