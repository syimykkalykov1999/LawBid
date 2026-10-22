// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_approval_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminApprovalDto _$AdminApprovalDtoFromJson(Map<String, dynamic> json) =>
    AdminApprovalDto(
      id: json['id'] as String,
      kind: AdminApprovalDtoKind.fromJson(json['kind'] as String),
      label: json['label'] as String,
      summary: json['summary'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      status: AdminApprovalDtoStatus.fromJson(json['status'] as String),
      payload: json['payload'],
      requestedBy: AdminApprovalPersonDto.fromJson(
        json['requestedBy'] as Map<String, dynamic>,
      ),
      approvedBy: json['approvedBy'] == null
          ? null
          : AdminApprovalPersonDto.fromJson(
              json['approvedBy'] as Map<String, dynamic>,
            ),
      rejectedBy: json['rejectedBy'] == null
          ? null
          : AdminApprovalPersonDto.fromJson(
              json['rejectedBy'] as Map<String, dynamic>,
            ),
      decisionNote: json['decisionNote'] as String?,
      error: json['error'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
      executedAt: json['executedAt'] == null
          ? null
          : DateTime.parse(json['executedAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      canDecide: json['canDecide'] as bool,
      mine: json['mine'] as bool,
    );

Map<String, dynamic> _$AdminApprovalDtoToJson(AdminApprovalDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind.toJson(),
      'label': instance.label,
      'summary': instance.summary,
      'amountCents': instance.amountCents,
      'status': instance.status.toJson(),
      'payload': ?instance.payload,
      'requestedBy': instance.requestedBy.toJson(),
      'approvedBy': ?instance.approvedBy?.toJson(),
      'rejectedBy': ?instance.rejectedBy?.toJson(),
      'decisionNote': ?instance.decisionNote,
      'error': ?instance.error,
      'createdAt': instance.createdAt.toIso8601String(),
      'decidedAt': ?instance.decidedAt?.toIso8601String(),
      'executedAt': ?instance.executedAt?.toIso8601String(),
      'expiresAt': instance.expiresAt.toIso8601String(),
      'canDecide': instance.canDecide,
      'mine': instance.mine,
    };
