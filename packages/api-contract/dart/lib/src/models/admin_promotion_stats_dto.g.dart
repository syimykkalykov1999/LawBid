// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_promotion_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPromotionStatsDto _$AdminPromotionStatsDtoFromJson(
  Map<String, dynamic> json,
) => AdminPromotionStatsDto(
  activeCount: (json['activeCount'] as num).toInt(),
  revenue30dCents: (json['revenue30dCents'] as num).toInt(),
  paid30dCount: (json['paid30dCount'] as num).toInt(),
  byStatus: (json['byStatus'] as List<dynamic>)
      .map((e) => PromotionStatusCountDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  activePosts: (json['activePosts'] as num).toInt(),
  activeCases: (json['activeCases'] as num).toInt(),
  pendingReview: (json['pendingReview'] as num).toInt(),
  impressions30d: (json['impressions30d'] as num).toInt(),
  reach30d: (json['reach30d'] as num).toInt(),
  clicks30d: (json['clicks30d'] as num).toInt(),
);

Map<String, dynamic> _$AdminPromotionStatsDtoToJson(
  AdminPromotionStatsDto instance,
) => <String, dynamic>{
  'activeCount': instance.activeCount,
  'revenue30dCents': instance.revenue30dCents,
  'paid30dCount': instance.paid30dCount,
  'byStatus': instance.byStatus.map((e) => e.toJson()).toList(),
  'activePosts': instance.activePosts,
  'activeCases': instance.activeCases,
  'pendingReview': instance.pendingReview,
  'impressions30d': instance.impressions30d,
  'reach30d': instance.reach30d,
  'clicks30d': instance.clicks30d,
};
