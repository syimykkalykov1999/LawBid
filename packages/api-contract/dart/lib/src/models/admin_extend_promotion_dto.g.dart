// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_extend_promotion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminExtendPromotionDto _$AdminExtendPromotionDtoFromJson(
  Map<String, dynamic> json,
) => AdminExtendPromotionDto(
  days: (json['days'] as num).toInt(),
  reason: json['reason'] as String,
);

Map<String, dynamic> _$AdminExtendPromotionDtoToJson(
  AdminExtendPromotionDto instance,
) => <String, dynamic>{'days': instance.days, 'reason': instance.reason};
