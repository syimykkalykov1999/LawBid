// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_promotion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePromotionDto _$CasePromotionDtoFromJson(Map<String, dynamic> json) =>
    CasePromotionDto(
      id: json['id'] as String,
      caseId: json['caseId'] as String,
      status: CasePromotionStatus.fromJson(json['status'] as String),
      days: (json['days'] as num).toInt(),
      priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
      totalCents: (json['totalCents'] as num).toInt(),
      impressions: (json['impressions'] as num).toInt(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      startsAt: json['startsAt'] == null
          ? null
          : DateTime.parse(json['startsAt'] as String),
      endsAt: json['endsAt'] == null
          ? null
          : DateTime.parse(json['endsAt'] as String),
    );

Map<String, dynamic> _$CasePromotionDtoToJson(CasePromotionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': instance.caseId,
      'status': instance.status.toJson(),
      'days': instance.days,
      'priceCentsPerDay': instance.priceCentsPerDay,
      'totalCents': instance.totalCents,
      'startsAt': ?instance.startsAt?.toIso8601String(),
      'endsAt': ?instance.endsAt?.toIso8601String(),
      'impressions': instance.impressions,
      'createdAt': instance.createdAt.toIso8601String(),
    };
