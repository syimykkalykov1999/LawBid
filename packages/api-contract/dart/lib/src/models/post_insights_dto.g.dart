// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_insights_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostInsightsDto _$PostInsightsDtoFromJson(Map<String, dynamic> json) =>
    PostInsightsDto(
      postId: json['postId'] as String,
      publishedAt: DateTime.parse(json['publishedAt'] as String),
      totals: PostInsightsCountsDto.fromJson(
        json['totals'] as Map<String, dynamic>,
      ),
      interactions: (json['interactions'] as num).toInt(),
      reachFollowers: (json['reachFollowers'] as num).toInt(),
      reachNonFollowers: (json['reachNonFollowers'] as num).toInt(),
      days: (json['days'] as List<dynamic>)
          .map((e) => PostInsightsDayDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PostInsightsDtoToJson(PostInsightsDto instance) =>
    <String, dynamic>{
      'postId': instance.postId,
      'publishedAt': instance.publishedAt.toIso8601String(),
      'totals': instance.totals.toJson(),
      'interactions': instance.interactions,
      'reachFollowers': instance.reachFollowers,
      'reachNonFollowers': instance.reachNonFollowers,
      'days': instance.days.map((e) => e.toJson()).toList(),
    };
