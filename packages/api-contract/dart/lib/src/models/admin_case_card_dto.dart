// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_bid_dto.dart';
import 'admin_case_card_dto_budget_mode.dart';
import 'admin_case_card_dto_dossier_missing.dart';
import 'admin_case_card_dto_status.dart';
import 'admin_case_invite_dto.dart';
import 'admin_case_state_dto.dart';
import 'admin_journal_entry_dto.dart';
import 'admin_party_dto.dart';
import 'case_deadline_kind.dart';
import 'case_urgency.dart';
import 'case_urgency_level.dart';

part 'admin_case_card_dto.g.dart';

@JsonSerializable()
class AdminCaseCardDto {
  const AdminCaseCardDto({
    required this.imagesCount,
    required this.title,
    required this.status,
    required this.clientId,
    required this.clientName,
    required this.practiceAreaId,
    required this.practiceAreaName,
    required this.stateCode,
    required this.bidsCount,
    required this.commentCount,
    required this.viewCount,
    required this.openReports,
    required this.promoted,
    required this.id,
    required this.documentsCount,
    required this.dossierScore,
    required this.dossierMissing,
    required this.urgency,
    required this.urgencyLevel,
    required this.deadlineAt,
    required this.deadlineKind,
    required this.lastActivityAt,
    required this.createdAt,
    required this.description,
    required this.city,
    required this.promotedUntil,
    required this.budgetCents,
    required this.client,
    required this.states,
    required this.photosCount,
    required this.acceptedBidId,
    required this.bids,
    required this.invites,
    required this.journal,
    required this.disputeIds,
    required this.contactIssueIds,
    required this.archivedAt,
    required this.closedAt,
    required this.budgetMode,
  });

  factory AdminCaseCardDto.fromJson(Map<String, Object?> json) =>
      _$AdminCaseCardDtoFromJson(json);

  final String id;
  final String title;
  final AdminCaseCardDtoStatus status;
  final String clientId;
  final String clientName;
  final String practiceAreaId;
  final String practiceAreaName;
  final String stateCode;
  final int bidsCount;
  final int commentCount;
  final int viewCount;
  final int openReports;

  /// A paid / granted promotion is running.
  final bool promoted;

  /// Owner 2026-10-05: the case dossier ("4 of 6").
  final int imagesCount;
  final int documentsCount;

  /// Filled-in items, 0–6.
  final int dossierScore;

  /// Dossier items the client has not filled in.
  final List<AdminCaseCardDtoDossierMissing> dossierMissing;
  final CaseUrgency? urgency;
  final CaseUrgencyLevel? urgencyLevel;
  final DateTime? deadlineAt;
  final CaseDeadlineKind? deadlineKind;
  final DateTime lastActivityAt;
  final DateTime createdAt;
  final String description;
  final String? city;
  final AdminCaseCardDtoBudgetMode budgetMode;
  final int? budgetCents;
  final AdminPartyDto client;
  final List<AdminCaseStateDto> states;
  final int photosCount;
  final String? acceptedBidId;

  /// Newest first (≤100).
  final List<AdminCaseBidDto> bids;

  /// Owner 2026-10-05: invites the client sent, newest first.
  final List<AdminCaseInviteDto> invites;

  /// case_journal, newest first (last 50).
  final List<AdminJournalEntryDto> journal;

  /// case_disputes ids.
  final List<String> disputeIds;

  /// contact_issue_reports ids.
  final List<String> contactIssueIds;
  final DateTime? archivedAt;
  final DateTime? closedAt;
  final DateTime? promotedUntil;

  Map<String, Object?> toJson() => _$AdminCaseCardDtoToJson(this);
}
