// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_budget_dto.dart';
import 'case_deadline_kind.dart';
import 'case_detail_for_attorney_dto_completion_requested_by.dart';
import 'case_dossier_dto.dart';
import 'case_photo_dto.dart';
import 'case_practice_area_dto.dart';
import 'case_status.dart';
import 'case_urgency.dart';
import 'case_urgency_level.dart';

part 'case_detail_for_attorney_dto.g.dart';

@JsonSerializable()
class CaseDetailForAttorneyDto {
  const CaseDetailForAttorneyDto({
    required this.createdAt,
    required this.title,
    required this.excerpt,
    required this.practiceArea,
    required this.primaryStateCode,
    required this.additionalStateCodes,
    required this.status,
    required this.budget,
    required this.id,
    required this.viewCount,
    required this.bidsCount,
    required this.isSaved,
    required this.isNew,
    required this.hasOwnBid,
    required this.commentCount,
    required this.shareCount,
    required this.bidAllowed,
    required this.promoted,
    required this.priorityClient,
    required this.dossier,
    required this.description,
    required this.inMyLicensedStates,
    required this.photos,
    required this.acceptedBidIsMine,
    required this.inMyPractice,
    required this.photosCount,
    this.ownBidId,
    this.deadlineKind,
    this.completionRequestedBy,
    this.deadlineAt,
    this.urgency,
    this.coverKey,
    this.city,
    this.urgencyLevel,
  });

  factory CaseDetailForAttorneyDto.fromJson(Map<String, Object?> json) =>
      _$CaseDetailForAttorneyDtoFromJson(json);

  final String id;
  final String title;

  /// Owner 2026-09-30: first ~180 characters of the description.
  final String excerpt;
  final CasePracticeAreaDto practiceArea;
  final String primaryStateCode;
  final List<String> additionalStateCodes;
  final String? city;
  final CaseStatus status;
  final CaseBudgetDto budget;

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
  final int viewCount;
  final int bidsCount;
  final DateTime createdAt;

  /// Younger than CASE_NEW_BADGE_HOURS (§4.2).
  final bool isNew;

  /// "Вы сделали бид" (§4.2/§4.3).
  final bool hasOwnBid;

  /// Owner 2026-09-30 (OQ-034): the case card works like a post card.
  final int commentCount;

  /// OQ-037.
  final int shareCount;

  /// In the viewer's saved items.
  final bool isSaved;

  /// Promoted by its client right now.
  final bool promoted;

  /// Owner 2026-10-05: the client's plan puts the case first in the feed (shown on top of the first page).
  final bool priorityClient;

  /// Owner 2026-10-05: how complete the case is (counts only).
  final CaseDossierDto dossier;
  final String description;

  /// The attorney's own bid on this case (§4.3: shown instead of "Сделать бид").
  final String? ownBidId;

  /// True when this attorney's bid is the case's accepted one (the hired lawyer: open the work screen).
  final bool acceptedBidIsMine;

  /// Owner 2026-10-02: who marked "Done" first while the case waits for the other side (null otherwise).
  final CaseDetailForAttorneyDtoCompletionRequestedBy? completionRequestedBy;

  /// OQ-031: photos — only when THIS attorney's bid was accepted.
  final List<CasePhotoDto> photos;

  /// OQ-031: how many photos the case has (shown to every attorney).
  final num photosCount;

  /// Owner 2026-09-30: the case's practice is one of this attorney's —.
  /// otherwise "Bid" warns that the client will be told.
  final bool inMyPractice;

  /// Owner 2026-10-04: the attorney holds a verified licence in one of.
  /// the case's states — otherwise "Bid" notes that the client will see it.
  final bool inMyLicensedStates;

  /// Owner 2026-10-04: an attorney may bid on any open case (any state, any practice); kept for older apps, always true.
  final bool bidAllowed;

  Map<String, Object?> toJson() => _$CaseDetailForAttorneyDtoToJson(this);
}
