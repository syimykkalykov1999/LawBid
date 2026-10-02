// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_status_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionStatusCountDto _$PromotionStatusCountDtoFromJson(
  Map<String, dynamic> json,
) => PromotionStatusCountDto(
  status: json['status'] as String,
  count: (json['count'] as num).toInt(),
);

Map<String, dynamic> _$PromotionStatusCountDtoToJson(
  PromotionStatusCountDto instance,
) => <String, dynamic>{'status': instance.status, 'count': instance.count};
