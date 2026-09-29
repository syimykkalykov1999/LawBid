// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_detail_for_attorney_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseDetailForAttorneyDto _$CaseDetailForAttorneyDtoFromJson(
  Map<String, dynamic> json,
) => CaseDetailForAttorneyDto(
  id: json['id'] as String,
  title: json['title'] as String,
  practiceArea: CasePracticeAreaDto.fromJson(
    json['practiceArea'] as Map<String, dynamic>,
  ),
  primaryStateCode: json['primaryStateCode'] as String,
  additionalStateCodes: (json['additionalStateCodes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  status: CaseStatus.fromJson(json['status'] as String),
  budget: CaseBudgetDto.fromJson(json['budget'] as Map<String, dynamic>),
  viewCount: (json['viewCount'] as num).toInt(),
  bidsCount: (json['bidsCount'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  isNew: json['isNew'] as bool,
  hasOwnBid: json['hasOwnBid'] as bool,
  description: json['description'] as String,
  isSaved: json['isSaved'] as bool,
  city: json['city'] as String?,
);

Map<String, dynamic> _$CaseDetailForAttorneyDtoToJson(
  CaseDetailForAttorneyDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'practiceArea': instance.practiceArea.toJson(),
  'primaryStateCode': instance.primaryStateCode,
  'additionalStateCodes': instance.additionalStateCodes,
  'city': ?instance.city,
  'status': instance.status.toJson(),
  'budget': instance.budget.toJson(),
  'viewCount': instance.viewCount,
  'bidsCount': instance.bidsCount,
  'createdAt': instance.createdAt.toIso8601String(),
  'isNew': instance.isNew,
  'hasOwnBid': instance.hasOwnBid,
  'description': instance.description,
  'isSaved': instance.isSaved,
};
