// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_grant_promotion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminGrantPromotionDto _$AdminGrantPromotionDtoFromJson(
  Map<String, dynamic> json,
) => AdminGrantPromotionDto(
  caseId: json['caseId'] as String,
  days: (json['days'] as num).toInt(),
  reason: json['reason'] as String,
);

Map<String, dynamic> _$AdminGrantPromotionDtoToJson(
  AdminGrantPromotionDto instance,
) => <String, dynamic>{
  'caseId': instance.caseId,
  'days': instance.days,
  'reason': instance.reason,
};
