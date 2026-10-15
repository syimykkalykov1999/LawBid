// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionStatsDto _$PromotionStatsDtoFromJson(Map<String, dynamic> json) =>
    PromotionStatsDto(
      promotion: MyPromotionDto.fromJson(
        json['promotion'] as Map<String, dynamic>,
      ),
      days: (json['days'] as List<dynamic>)
          .map((e) => PromotionDayDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      spentCents: (json['spentCents'] as num).toInt(),
    );

Map<String, dynamic> _$PromotionStatsDtoToJson(PromotionStatsDto instance) =>
    <String, dynamic>{
      'promotion': instance.promotion.toJson(),
      'days': instance.days.map((e) => e.toJson()).toList(),
      'spentCents': instance.spentCents,
    };
