// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_summary_dto.dart';
import 'admin_party_dto.dart';

part 'admin_contact_issue_dto.g.dart';

@JsonSerializable()
class AdminContactIssueDto {
  const AdminContactIssueDto({
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
  });

  factory AdminContactIssueDto.fromJson(Map<String, Object?> json) =>
      _$AdminContactIssueDtoFromJson(json);

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

  Map<String, Object?> toJson() => _$AdminContactIssueDtoToJson(this);
}
