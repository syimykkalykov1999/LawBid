// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_summary_dto.dart';
import 'admin_contact_issue_dto.dart';
import 'admin_party_dto.dart';

part 'admin_contact_issue_card_dto.g.dart';

@JsonSerializable()
class AdminContactIssueCardDto {
  const AdminContactIssueCardDto({
    required this.id,
    required this.status,
    required this.issueType,
    required this.note,
    required this.createdAt,
    required this.resolvedAt,
    required this.resolvedBy,
    required this.resolutionNote,
    required this.caseValue,
    required this.attorney,
    required this.clientConfirmedReports,
    required this.suspendThreshold,
    required this.disclosedFields,
    required this.disclosedAt,
    required this.clientHistory,
  });

  factory AdminContactIssueCardDto.fromJson(Map<String, Object?> json) =>
      _$AdminContactIssueCardDtoFromJson(json);

  final String id;
  final String status;
  final String issueType;
  final String? note;
  final DateTime createdAt;
  final DateTime? resolvedAt;
  final String? resolvedBy;
  final String? resolutionNote;

  /// The name has been replaced because it contains a keyword. Original name: `case`.
  @JsonKey(name: 'case')
  final AdminCaseSummaryDto caseValue;

  /// Reporting attorney.
  final AdminPartyDto? attorney;

  /// The client's confirmed reports so far.
  final int clientConfirmedReports;

  /// contacts.suspend_after_confirmed_reports
  final int suspendThreshold;

  /// Contact fields disclosed for this bid.
  final List<String> disclosedFields;
  final DateTime? disclosedAt;

  /// The client's other reports.
  final List<AdminContactIssueDto> clientHistory;

  Map<String, Object?> toJson() => _$AdminContactIssueCardDtoToJson(this);
}
