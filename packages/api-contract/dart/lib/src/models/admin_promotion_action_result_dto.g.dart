// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_promotion_action_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPromotionActionResultDto _$AdminPromotionActionResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminPromotionActionResultDto(
  promotion: AdminPromotionRowDto.fromJson(
    json['promotion'] as Map<String, dynamic>,
  ),
  note: json['note'] as String?,
);

Map<String, dynamic> _$AdminPromotionActionResultDtoToJson(
  AdminPromotionActionResultDto instance,
) => <String, dynamic>{
  'promotion': instance.promotion.toJson(),
  'note': ?instance.note,
};
