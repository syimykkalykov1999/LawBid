// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_bid_dto.dart';
import 'admin_case_card_dto_budget_mode.dart';
import 'admin_case_card_dto_status.dart';
import 'admin_case_state_dto.dart';
import 'admin_journal_entry_dto.dart';
import 'admin_party_dto.dart';

part 'admin_case_card_dto.g.dart';

@JsonSerializable()
class AdminCaseCardDto {
  const AdminCaseCardDto({
    required this.id,
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
    required this.lastActivityAt,
    required this.createdAt,
    required this.description,
    required this.city,
    required this.budgetMode,
    required this.budgetCents,
    required this.client,
    required this.states,
    required this.photosCount,
    required this.acceptedBidId,
    required this.bids,
    required this.journal,
    required this.disputeIds,
    required this.contactIssueIds,
    required this.archivedAt,
    required this.closedAt,
    required this.promotedUntil,
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
