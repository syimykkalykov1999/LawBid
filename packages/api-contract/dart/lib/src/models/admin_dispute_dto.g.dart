// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dispute_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDisputeDto _$AdminDisputeDtoFromJson(
  Map<String, dynamic> json,
) => AdminDisputeDto(
  id: json['id'] as String,
  status: json['status'] as String,
  reason: json['reason'] as String,
  openedBy: json['openedBy'] as String,
  openedByRole: json['openedByRole'] == null
      ? null
      : AdminDisputeDtoOpenedByRole.fromJson(json['openedByRole'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  resolvedAt: json['resolvedAt'] == null
      ? null
      : DateTime.parse(json['resolvedAt'] as String),
  resolvedBy: json['resolvedBy'] as String?,
  resolutionNote: json['resolutionNote'] as String?,
  caseValue: AdminCaseSummaryDto.fromJson(json['case'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDisputeDtoToJson(AdminDisputeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status,
      'reason': instance.reason,
      'openedBy': instance.openedBy,
      'openedByRole': ?instance.openedByRole?.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
      'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
      'resolvedBy': ?instance.resolvedBy,
      'resolutionNote': ?instance.resolutionNote,
      'case': instance.caseValue.toJson(),
    };
