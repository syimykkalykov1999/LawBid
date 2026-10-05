// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_cancel_promotion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCancelPromotionDto _$AdminCancelPromotionDtoFromJson(
  Map<String, dynamic> json,
) => AdminCancelPromotionDto(
  reason: json['reason'] as String? ?? '',
  refund: json['refund'] == null
      ? PromotionRefundMode.none
      : PromotionRefundMode.fromJson(json['refund'] as String),
);

Map<String, dynamic> _$AdminCancelPromotionDtoToJson(
  AdminCancelPromotionDto instance,
) => <String, dynamic>{
  'reason': instance.reason,
  'refund': instance.refund.toJson(),
};
