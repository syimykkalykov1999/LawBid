// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_invite_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseInviteDto _$CaseInviteDtoFromJson(Map<String, dynamic> json) =>
    CaseInviteDto(
      id: json['id'] as String,
      caseId: json['caseId'] as String,
      attorneyId: json['attorneyId'] as String,
      status: CaseInviteStatus.fromJson(json['status'] as String),
      message: json['message'] as String?,
      budgetCents: (json['budgetCents'] as num?)?.toInt(),
      declineReason: json['declineReason'] as String?,
      outsidePractice: json['outsidePractice'] as bool,
      outsideLicensedStates: json['outsideLicensedStates'] as bool,
      bidId: json['bidId'] as String?,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      caseTitle: json['caseTitle'] as String,
      caseStatus: json['caseStatus'] as String,
      casePracticeKey: json['casePracticeKey'] as String,
      caseStateCodes: (json['caseStateCodes'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      attorney: json['attorney'] == null
          ? null
          : BidAttorneySummaryDto.fromJson(
              json['attorney'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$CaseInviteDtoToJson(CaseInviteDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': instance.caseId,
      'attorneyId': instance.attorneyId,
      'status': instance.status.toJson(),
      'message': ?instance.message,
      'budgetCents': ?instance.budgetCents,
      'declineReason': ?instance.declineReason,
      'outsidePractice': instance.outsidePractice,
      'outsideLicensedStates': instance.outsideLicensedStates,
      'bidId': ?instance.bidId,
      'expiresAt': instance.expiresAt.toIso8601String(),
      'decidedAt': ?instance.decidedAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'caseTitle': instance.caseTitle,
      'caseStatus': instance.caseStatus,
      'casePracticeKey': instance.casePracticeKey,
      'caseStateCodes': instance.caseStateCodes,
      'attorney': ?instance.attorney?.toJson(),
    };
