// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_attorney_summary_dto.dart';
import 'case_budget_dto.dart';
import 'case_deadline_kind.dart';
import 'case_dossier_dto.dart';
import 'case_invite_status.dart';
import 'case_urgency.dart';
import 'case_urgency_level.dart';

part 'case_invite_dto.g.dart';

@JsonSerializable()
class CaseInviteDto {
  const CaseInviteDto({
    required this.id,
    required this.caseId,
    required this.attorneyId,
    required this.status,
    required this.message,
    required this.budgetCents,
    required this.declineReason,
    required this.outsidePractice,
    required this.outsideLicensedStates,
    required this.bidId,
    required this.expiresAt,
    required this.decidedAt,
    required this.createdAt,
    required this.caseTitle,
    required this.caseStatus,
    required this.casePracticeKey,
    required this.caseStateCodes,
    required this.caseBudget,
    required this.caseDossier,
    required this.attorney,
    this.caseCity,
    this.caseUrgency,
    this.caseUrgencyLevel,
    this.caseDeadlineAt,
    this.caseDeadlineKind,
  });

  factory CaseInviteDto.fromJson(Map<String, Object?> json) =>
      _$CaseInviteDtoFromJson(json);

  final String id;
  final String caseId;
  final String attorneyId;
  final CaseInviteStatus status;
  final String? message;
  final int? budgetCents;
  final String? declineReason;

  /// The case's practice is not one of the attorney's.
  final bool outsidePractice;

  /// The attorney holds no verified licence in the case's states.
  final bool outsideLicensedStates;

  /// The attorney's bid that answered the invite.
  final String? bidId;
  final DateTime expiresAt;
  final DateTime? decidedAt;
  final DateTime createdAt;
  final String caseTitle;

  /// cases.status
  final String caseStatus;

  /// i18n key of the case's practice area.
  final String casePracticeKey;
  final List<String> caseStateCodes;

  /// Owner 2026-10-05: the dossier ("Case file 4 of 6") on the invite, so.
  /// the attorney sees what the client filled in before answering. Counts.
  /// only — the files open once the client accepts the attorney's bid.
  final String? caseCity;
  final CaseUrgency? caseUrgency;

  /// Owner 2026-10-05: the level the case reads as today.
  final CaseUrgencyLevel? caseUrgencyLevel;
  final DateTime? caseDeadlineAt;
  final CaseDeadlineKind? caseDeadlineKind;
  final CaseBudgetDto caseBudget;
  final CaseDossierDto caseDossier;

  /// The invited attorney (client view only).
  final BidAttorneySummaryDto? attorney;

  Map<String, Object?> toJson() => _$CaseInviteDtoToJson(this);
}
