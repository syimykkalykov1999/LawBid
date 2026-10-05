// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_attorney_summary_dto.dart';
import 'case_invite_status.dart';

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
    required this.attorney,
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

  /// The invited attorney (client view only).
  final BidAttorneySummaryDto? attorney;

  Map<String, Object?> toJson() => _$CaseInviteDtoToJson(this);
}
