// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_promotion_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPromotionRowDto _$AdminPromotionRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminPromotionRowDto(
  id: json['id'] as String,
  targetType: PromotionTarget.fromJson(json['targetType'] as String),
  status: CasePromotionStatus.fromJson(json['status'] as String),
  days: (json['days'] as num).toInt(),
  priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
  totalCents: (json['totalCents'] as num).toInt(),
  impressions: (json['impressions'] as num).toInt(),
  reach: (json['reach'] as num).toInt(),
  clicks: (json['clicks'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  caseTitle: json['caseTitle'] as String,
  refundedCents: (json['refundedCents'] as num).toInt(),
  caseStatus: json['caseStatus'] as String,
  ownerId: json['ownerId'] as String,
  caseId: json['caseId'] as String?,
  postId: json['postId'] as String?,
  startsAt: json['startsAt'] == null
      ? null
      : DateTime.parse(json['startsAt'] as String),
  endsAt: json['endsAt'] == null
      ? null
      : DateTime.parse(json['endsAt'] as String),
  targetImpressions: (json['targetImpressions'] as num?)?.toInt(),
  audience: json['audience'] == null
      ? null
      : PromotionAudienceDto.fromJson(json['audience'] as Map<String, dynamic>),
  cancelReason: json['cancelReason'] as String?,
  reviewedBy: json['reviewedBy'] as String?,
  cpmCents: (json['cpmCents'] as num?)?.toInt(),
  ownerName: json['ownerName'] as String?,
  ownerEmail: json['ownerEmail'] as String?,
  paymentId: json['paymentId'] as String?,
  promoCodeId: json['promoCodeId'] as String?,
  grantedBy: json['grantedBy'] as String?,
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
  'startsAt': ?instance.startsAt?.toIso8601String(),
  'endsAt': ?instance.endsAt?.toIso8601String(),
  'impressions': instance.impressions,
  'reach': instance.reach,
  'clicks': instance.clicks,
  'targetImpressions': ?instance.targetImpressions,
  'audience': ?instance.audience?.toJson(),
  'cancelReason': ?instance.cancelReason,
  'createdAt': instance.createdAt.toIso8601String(),
  'caseTitle': instance.caseTitle,
  'reviewedBy': ?instance.reviewedBy,
  'refundedCents': instance.refundedCents,
  'cpmCents': ?instance.cpmCents,
  'caseStatus': instance.caseStatus,
  'ownerId': instance.ownerId,
  'ownerName': ?instance.ownerName,
  'ownerEmail': ?instance.ownerEmail,
  'paymentId': ?instance.paymentId,
  'promoCodeId': ?instance.promoCodeId,
  'grantedBy': ?instance.grantedBy,
};
