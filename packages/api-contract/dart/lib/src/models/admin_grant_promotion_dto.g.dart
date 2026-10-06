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
  dailyBudgetCents: (json['dailyBudgetCents'] as num?)?.toInt(),
  target: json['target'] == null
      ? PromotionTarget.valueCase
      : PromotionTarget.fromJson(json['target'] as String),
  reason: json['reason'] as String? ?? '',
);

Map<String, dynamic> _$AdminGrantPromotionDtoToJson(
  AdminGrantPromotionDto instance,
) => <String, dynamic>{
  'target': instance.target.toJson(),
  'caseId': instance.caseId,
  'dailyBudgetCents': ?instance.dailyBudgetCents,
  'days': instance.days,
  'reason': instance.reason,
};
