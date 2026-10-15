// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionDayDto _$PromotionDayDtoFromJson(Map<String, dynamic> json) =>
    PromotionDayDto(
      day: json['day'] as String,
      impressions: (json['impressions'] as num).toInt(),
      reach: (json['reach'] as num).toInt(),
      clicks: (json['clicks'] as num).toInt(),
    );

Map<String, dynamic> _$PromotionDayDtoToJson(PromotionDayDto instance) =>
    <String, dynamic>{
      'day': instance.day,
      'impressions': instance.impressions,
      'reach': instance.reach,
      'clicks': instance.clicks,
    };
