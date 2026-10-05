// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseSummaryDto _$CaseSummaryDtoFromJson(Map<String, dynamic> json) =>
    CaseSummaryDto(
      id: json['id'] as String,
      title: json['title'] as String,
      practiceArea: PracticeAreaRefDto.fromJson(
        json['practiceArea'] as Map<String, dynamic>,
      ),
      primaryStateCode: json['primaryStateCode'] as String,
      additionalStateCount: (json['additionalStateCount'] as num).toInt(),
      status: CaseStatus.fromJson(json['status'] as String),
      budgetMode: BudgetMode.fromJson(json['budgetMode'] as String),
      bidsCount: (json['bidsCount'] as num).toInt(),
      createdAt: json['createdAt'] as String,
      lastActivityAt: json['lastActivityAt'] as String,
      coverUrl: json['coverUrl'] as String?,
      city: json['city'] as String?,
      budgetCents: (json['budgetCents'] as num?)?.toInt(),
      coverKey: json['coverKey'] as String?,
      urgency: json['urgency'] == null
          ? null
          : CaseUrgency.fromJson(json['urgency'] as String),
      urgencyLevel: json['urgencyLevel'] == null
          ? null
          : CaseUrgencyLevel.fromJson(json['urgencyLevel'] as String),
      deadlineAt: json['deadlineAt'] == null
          ? null
          : DateTime.parse(json['deadlineAt'] as String),
      deadlineKind: json['deadlineKind'] == null
          ? null
          : CaseDeadlineKind.fromJson(json['deadlineKind'] as String),
    );

Map<String, dynamic> _$CaseSummaryDtoToJson(CaseSummaryDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'coverUrl': ?instance.coverUrl,
      'title': instance.title,
      'practiceArea': instance.practiceArea.toJson(),
      'primaryStateCode': instance.primaryStateCode,
      'additionalStateCount': instance.additionalStateCount,
      'city': ?instance.city,
      'status': instance.status.toJson(),
      'budgetMode': instance.budgetMode.toJson(),
      'budgetCents': ?instance.budgetCents,
      'coverKey': ?instance.coverKey,
      'urgency': ?instance.urgency?.toJson(),
      'urgencyLevel': ?instance.urgencyLevel?.toJson(),
      'deadlineAt': ?instance.deadlineAt?.toIso8601String(),
      'deadlineKind': ?instance.deadlineKind?.toJson(),
      'bidsCount': instance.bidsCount,
      'createdAt': instance.createdAt,
      'lastActivityAt': instance.lastActivityAt,
    };
