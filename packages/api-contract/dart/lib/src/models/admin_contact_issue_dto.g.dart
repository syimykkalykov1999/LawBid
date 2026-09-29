// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_contact_issue_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminContactIssueDto _$AdminContactIssueDtoFromJson(
  Map<String, dynamic> json,
) => AdminContactIssueDto(
  id: json['id'] as String,
  status: json['status'] as String,
  issueType: json['issueType'] as String,
  note: json['note'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
  resolvedAt: json['resolvedAt'] == null
      ? null
      : DateTime.parse(json['resolvedAt'] as String),
  resolvedBy: json['resolvedBy'] as String?,
  resolutionNote: json['resolutionNote'] as String?,
  caseValue: AdminCaseSummaryDto.fromJson(json['case'] as Map<String, dynamic>),
  attorney: json['attorney'] == null
      ? null
      : AdminPartyDto.fromJson(json['attorney'] as Map<String, dynamic>),
  clientConfirmedReports: (json['clientConfirmedReports'] as num).toInt(),
  suspendThreshold: (json['suspendThreshold'] as num).toInt(),
);

Map<String, dynamic> _$AdminContactIssueDtoToJson(
  AdminContactIssueDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status,
  'issueType': instance.issueType,
  'note': ?instance.note,
  'createdAt': instance.createdAt.toIso8601String(),
  'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
  'resolvedBy': ?instance.resolvedBy,
  'resolutionNote': ?instance.resolutionNote,
  'case': instance.caseValue.toJson(),
  'attorney': ?instance.attorney?.toJson(),
  'clientConfirmedReports': instance.clientConfirmedReports,
  'suspendThreshold': instance.suspendThreshold,
};
