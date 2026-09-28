// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseDto _$CaseDtoFromJson(Map<String, dynamic> json) => CaseDto(
  id: json['id'] as String,
  title: json['title'] as String,
  description: json['description'] as String,
  practiceArea: PracticeAreaRefDto.fromJson(
    json['practiceArea'] as Map<String, dynamic>,
  ),
  primaryStateCode: json['primaryStateCode'] as String,
  states: (json['states'] as List<dynamic>)
      .map((e) => CaseStateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  budgetMode: BudgetMode.fromJson(json['budgetMode'] as String),
  status: CaseStatus.fromJson(json['status'] as String),
  viewCount: (json['viewCount'] as num).toInt(),
  bidsCount: (json['bidsCount'] as num).toInt(),
  createdAt: json['createdAt'] as String,
  lastActivityAt: json['lastActivityAt'] as String,
  city: json['city'] as String?,
  budgetCents: (json['budgetCents'] as num?)?.toInt(),
  archivedAt: json['archivedAt'] as String?,
  clientCompletedAt: json['clientCompletedAt'] as String?,
  attorneyConfirmedAt: json['attorneyConfirmedAt'] as String?,
  autoCloseAt: json['autoCloseAt'] as String?,
  closedAt: json['closedAt'] as String?,
  deletedAt: json['deletedAt'] as String?,
);

Map<String, dynamic> _$CaseDtoToJson(CaseDto instance) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'description': instance.description,
  'practiceArea': instance.practiceArea.toJson(),
  'primaryStateCode': instance.primaryStateCode,
  'states': instance.states.map((e) => e.toJson()).toList(),
  'city': ?instance.city,
  'budgetMode': instance.budgetMode.toJson(),
  'budgetCents': ?instance.budgetCents,
  'status': instance.status.toJson(),
  'viewCount': instance.viewCount,
  'bidsCount': instance.bidsCount,
  'createdAt': instance.createdAt,
  'lastActivityAt': instance.lastActivityAt,
  'archivedAt': ?instance.archivedAt,
  'clientCompletedAt': ?instance.clientCompletedAt,
  'attorneyConfirmedAt': ?instance.attorneyConfirmedAt,
  'autoCloseAt': ?instance.autoCloseAt,
  'closedAt': ?instance.closedAt,
  'deletedAt': ?instance.deletedAt,
};
