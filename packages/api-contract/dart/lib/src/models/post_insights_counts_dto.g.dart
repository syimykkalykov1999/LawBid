// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_insights_counts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostInsightsCountsDto _$PostInsightsCountsDtoFromJson(
  Map<String, dynamic> json,
) => PostInsightsCountsDto(
  impressions: (json['impressions'] as num).toInt(),
  reach: (json['reach'] as num).toInt(),
  views: (json['views'] as num).toInt(),
  likes: (json['likes'] as num).toInt(),
  comments: (json['comments'] as num).toInt(),
  saves: (json['saves'] as num).toInt(),
  reposts: (json['reposts'] as num).toInt(),
  shares: (json['shares'] as num).toInt(),
  profileVisits: (json['profileVisits'] as num).toInt(),
);

Map<String, dynamic> _$PostInsightsCountsDtoToJson(
  PostInsightsCountsDto instance,
) => <String, dynamic>{
  'impressions': instance.impressions,
  'reach': instance.reach,
  'views': instance.views,
  'likes': instance.likes,
  'comments': instance.comments,
  'saves': instance.saves,
  'reposts': instance.reposts,
  'shares': instance.shares,
  'profileVisits': instance.profileVisits,
};
