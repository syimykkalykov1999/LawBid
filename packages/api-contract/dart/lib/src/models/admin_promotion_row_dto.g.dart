// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_promotion_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPromotionRowDto _$AdminPromotionRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminPromotionRowDto(
  reach: (json['reach'] as num).toInt(),
  targetType: PromotionTarget.fromJson(json['targetType'] as String),
  ownerId: json['ownerId'] as String,
  caseTitle: json['caseTitle'] as String,
  status: CasePromotionStatus.fromJson(json['status'] as String),
  days: (json['days'] as num).toInt(),
  priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
  totalCents: (json['totalCents'] as num).toInt(),
  paidStars: (json['paidStars'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  refundedCents: (json['refundedCents'] as num).toInt(),
  impressions: (json['impressions'] as num).toInt(),
  id: json['id'] as String,
  clicks: (json['clicks'] as num).toInt(),
  actions: (json['actions'] as num).toInt(),
  billing: BoostBilling.fromJson(json['billing'] as String),
  caseStatus: json['caseStatus'] as String,
  deliveredUnits: (json['deliveredUnits'] as num).toInt(),
  unitPriceCents: (json['unitPriceCents'] as num?)?.toInt(),
  targetImpressions: (json['targetImpressions'] as num?)?.toInt(),
  endsAt: json['endsAt'] == null
      ? null
      : DateTime.parse(json['endsAt'] as String),
  audience: json['audience'] == null
      ? null
      : PromotionAudienceDto.fromJson(json['audience'] as Map<String, dynamic>),
  cancelReason: json['cancelReason'] as String?,
  goal: json['goal'] as String?,
  grantedBy: json['grantedBy'] as String?,
  ctaValue: json['ctaValue'] as String?,
  startsAt: json['startsAt'] == null
      ? null
      : DateTime.parse(json['startsAt'] as String),
  postId: json['postId'] as String?,
  reviewedBy: json['reviewedBy'] as String?,
  cpmCents: (json['cpmCents'] as num?)?.toInt(),
  ctaType: json['ctaType'] as String?,
  caseId: json['caseId'] as String?,
  ownerName: json['ownerName'] as String?,
  ownerEmail: json['ownerEmail'] as String?,
  paymentId: json['paymentId'] as String?,
  promoCodeId: json['promoCodeId'] as String?,
  targetUnits: (json['targetUnits'] as num?)?.toInt(),
);

Map<String, dynamic> _$AdminPromotionRowDtoToJson(
  AdminPromotionRowDto instance,
) => <String, dynamic>{
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
  'caseTitle': instance.caseTitle,
  'reviewedBy': ?instance.reviewedBy,
  'cpmCents': ?instance.cpmCents,
  'caseStatus': instance.caseStatus,
  'ownerId': instance.ownerId,
  'ownerName': ?instance.ownerName,
  'ownerEmail': ?instance.ownerEmail,
  'paymentId': ?instance.paymentId,
  'promoCodeId': ?instance.promoCodeId,
  'grantedBy': ?instance.grantedBy,
};
