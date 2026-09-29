// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_contact_issue_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminContactIssueCardDto _$AdminContactIssueCardDtoFromJson(
  Map<String, dynamic> json,
) => AdminContactIssueCardDto(
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
  disclosedFields: (json['disclosedFields'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  disclosedAt: json['disclosedAt'] == null
      ? null
      : DateTime.parse(json['disclosedAt'] as String),
  clientHistory: (json['clientHistory'] as List<dynamic>)
      .map((e) => AdminContactIssueDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AdminContactIssueCardDtoToJson(
  AdminContactIssueCardDto instance,
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
  'disclosedFields': instance.disclosedFields,
  'disclosedAt': ?instance.disclosedAt?.toIso8601String(),
  'clientHistory': instance.clientHistory.map((e) => e.toJson()).toList(),
};
