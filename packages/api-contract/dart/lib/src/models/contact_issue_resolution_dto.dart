// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_issue_report_dto.dart';

part 'contact_issue_resolution_dto.g.dart';

@JsonSerializable()
class ContactIssueResolutionDto {
  const ContactIssueResolutionDto({
    required this.report,
    required this.confirmedReports,
    required this.clientSuspended,
  });

  factory ContactIssueResolutionDto.fromJson(Map<String, Object?> json) =>
      _$ContactIssueResolutionDtoFromJson(json);

  final ContactIssueReportDto report;

  /// The client's confirmed reports after this decision (all cases).
  final num confirmedReports;

  /// True when this decision reached contacts.suspend_after_confirmed_reports and suspended the client.
  final bool clientSuspended;

  Map<String, Object?> toJson() => _$ContactIssueResolutionDtoToJson(this);
}
