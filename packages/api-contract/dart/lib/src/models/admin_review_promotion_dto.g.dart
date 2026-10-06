// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_review_promotion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReviewPromotionDto _$AdminReviewPromotionDtoFromJson(
  Map<String, dynamic> json,
) => AdminReviewPromotionDto(
  decision: AdminReviewPromotionDtoDecision.fromJson(
    json['decision'] as String,
  ),
  reason: json['reason'] as String? ?? '',
);

Map<String, dynamic> _$AdminReviewPromotionDtoToJson(
  AdminReviewPromotionDto instance,
) => <String, dynamic>{
  'decision': instance.decision.toJson(),
  'reason': instance.reason,
};
