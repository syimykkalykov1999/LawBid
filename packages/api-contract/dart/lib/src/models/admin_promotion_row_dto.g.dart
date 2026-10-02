// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_promotion_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPromotionRowDto _$AdminPromotionRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminPromotionRowDto(
  id: json['id'] as String,
  caseId: json['caseId'] as String,
  status: CasePromotionStatus.fromJson(json['status'] as String),
  days: (json['days'] as num).toInt(),
  priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
  totalCents: (json['totalCents'] as num).toInt(),
  impressions: (json['impressions'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  caseTitle: json['caseTitle'] as String,
  caseStatus: json['caseStatus'] as String,
  ownerId: json['ownerId'] as String,
  startsAt: json['startsAt'] == null
      ? null
      : DateTime.parse(json['startsAt'] as String),
  endsAt: json['endsAt'] == null
      ? null
      : DateTime.parse(json['endsAt'] as String),
  ownerName: json['ownerName'] as String?,
  ownerEmail: json['ownerEmail'] as String?,
  paymentId: json['paymentId'] as String?,
  promoCodeId: json['promoCodeId'] as String?,
  grantedBy: json['grantedBy'] as String?,
  cancelReason: json['cancelReason'] as String?,
);

Map<String, dynamic> _$AdminPromotionRowDtoToJson(
  AdminPromotionRowDto instance,
) => <String, dynamic>{
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
  'caseTitle': instance.caseTitle,
  'caseStatus': instance.caseStatus,
  'ownerId': instance.ownerId,
  'ownerName': ?instance.ownerName,
  'ownerEmail': ?instance.ownerEmail,
  'paymentId': ?instance.paymentId,
  'promoCodeId': ?instance.promoCodeId,
  'grantedBy': ?instance.grantedBy,
  'cancelReason': ?instance.cancelReason,
};
