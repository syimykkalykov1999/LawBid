// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_issue_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactIssueReportDto _$ContactIssueReportDtoFromJson(
  Map<String, dynamic> json,
) => ContactIssueReportDto(
  id: json['id'] as String,
  caseId: json['caseId'] as String,
  bidId: json['bidId'] as String,
  issueType: ContactIssueType.fromJson(json['issueType'] as String),
  note: json['note'] as String?,
  status: ContactIssueStatus.fromJson(json['status'] as String),
  resolvedAt: json['resolvedAt'] == null
      ? null
      : DateTime.parse(json['resolvedAt'] as String),
  resolutionNote: json['resolutionNote'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$ContactIssueReportDtoToJson(
  ContactIssueReportDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'caseId': instance.caseId,
  'bidId': instance.bidId,
  'issueType': instance.issueType.toJson(),
  'note': ?instance.note,
  'status': instance.status.toJson(),
  'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
  'resolutionNote': ?instance.resolutionNote,
  'createdAt': instance.createdAt.toIso8601String(),
};
