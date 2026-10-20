// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_insights_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostInsightsDayDto _$PostInsightsDayDtoFromJson(Map<String, dynamic> json) =>
    PostInsightsDayDto(
      impressions: (json['impressions'] as num).toInt(),
      reach: (json['reach'] as num).toInt(),
      views: (json['views'] as num).toInt(),
      likes: (json['likes'] as num).toInt(),
      comments: (json['comments'] as num).toInt(),
      saves: (json['saves'] as num).toInt(),
      reposts: (json['reposts'] as num).toInt(),
      shares: (json['shares'] as num).toInt(),
      profileVisits: (json['profileVisits'] as num).toInt(),
      date: DateTime.parse(json['date'] as String),
    );

Map<String, dynamic> _$PostInsightsDayDtoToJson(PostInsightsDayDto instance) =>
    <String, dynamic>{
      'impressions': instance.impressions,
      'reach': instance.reach,
      'views': instance.views,
      'likes': instance.likes,
      'comments': instance.comments,
      'saves': instance.saves,
      'reposts': instance.reposts,
      'shares': instance.shares,
      'profileVisits': instance.profileVisits,
      'date': instance.date.toIso8601String(),
    };
