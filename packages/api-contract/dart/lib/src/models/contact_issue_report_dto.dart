// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_issue_status.dart';
import 'contact_issue_type.dart';

part 'contact_issue_report_dto.g.dart';

@JsonSerializable()
class ContactIssueReportDto {
  const ContactIssueReportDto({
    required this.id,
    required this.caseId,
    required this.bidId,
    required this.issueType,
    required this.note,
    required this.status,
    required this.resolvedAt,
    required this.resolutionNote,
    required this.createdAt,
  });

  factory ContactIssueReportDto.fromJson(Map<String, Object?> json) =>
      _$ContactIssueReportDtoFromJson(json);

  final String id;
  final String caseId;
  final String bidId;
  final ContactIssueType issueType;
  final String? note;
  final ContactIssueStatus status;
  final DateTime? resolvedAt;
  final String? resolutionNote;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$ContactIssueReportDtoToJson(this);
}
