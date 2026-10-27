// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_promotion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePromotionDto _$CasePromotionDtoFromJson(Map<String, dynamic> json) =>
    CasePromotionDto(
      id: json['id'] as String,
      targetType: PromotionTarget.fromJson(json['targetType'] as String),
      status: CasePromotionStatus.fromJson(json['status'] as String),
      days: (json['days'] as num).toInt(),
      priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
      totalCents: (json['totalCents'] as num).toInt(),
      paidStars: (json['paidStars'] as num).toInt(),
      impressions: (json['impressions'] as num).toInt(),
      reach: (json['reach'] as num).toInt(),
      clicks: (json['clicks'] as num).toInt(),
      billing: BoostBilling.fromJson(json['billing'] as String),
      deliveredUnits: (json['deliveredUnits'] as num).toInt(),
      actions: (json['actions'] as num).toInt(),
      refundedCents: (json['refundedCents'] as num).toInt(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      caseId: json['caseId'] as String?,
      postId: json['postId'] as String?,
      startsAt: json['startsAt'] == null
          ? null
          : DateTime.parse(json['startsAt'] as String),
      endsAt: json['endsAt'] == null
          ? null
          : DateTime.parse(json['endsAt'] as String),
      targetImpressions: (json['targetImpressions'] as num?)?.toInt(),
      unitPriceCents: (json['unitPriceCents'] as num?)?.toInt(),
      targetUnits: (json['targetUnits'] as num?)?.toInt(),
      audience: json['audience'] == null
          ? null
          : PromotionAudienceDto.fromJson(
              json['audience'] as Map<String, dynamic>,
            ),
      cancelReason: json['cancelReason'] as String?,
      goal: json['goal'] as String?,
      ctaType: json['ctaType'] as String?,
      ctaValue: json['ctaValue'] as String?,
    );

Map<String, dynamic> _$CasePromotionDtoToJson(CasePromotionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'targetType': instance.targetType.toJson(),
      'caseId': ?instance.caseId,
      'postId': ?instance.postId,
      'status': instance.status.toJson(),
      'days': instance.days,
      'priceCentsPerDay': instance.priceCentsPerDay,
      'totalCents': instance.totalCents,
      'paidStars': instance.paidStars,
      'startsAt': ?instance.startsAt?.toIso8601String(),
      'endsAt': ?instance.endsAt?.toIso8601String(),
      'impressions': instance.impressions,
      'reach': instance.reach,
      'clicks': instance.clicks,
      'targetImpressions': ?instance.targetImpressions,
      'billing': instance.billing.toJson(),
      'unitPriceCents': ?instance.unitPriceCents,
      'targetUnits': ?instance.targetUnits,
      'deliveredUnits': instance.deliveredUnits,
      'actions': instance.actions,
      'refundedCents': instance.refundedCents,
      'audience': ?instance.audience?.toJson(),
      'cancelReason': ?instance.cancelReason,
      'goal': ?instance.goal,
      'ctaType': ?instance.ctaType,
      'ctaValue': ?instance.ctaValue,
      'createdAt': instance.createdAt.toIso8601String(),
    };
