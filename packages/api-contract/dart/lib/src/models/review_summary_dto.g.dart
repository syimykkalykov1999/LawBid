// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewSummaryDto _$ReviewSummaryDtoFromJson(Map<String, dynamic> json) =>
    ReviewSummaryDto(
      ratingAvg: json['ratingAvg'] as num?,
      ratingCount: (json['ratingCount'] as num).toInt(),
      distribution: (json['distribution'] as List<dynamic>)
          .map((e) => RatingBucketDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ReviewSummaryDtoToJson(ReviewSummaryDto instance) =>
    <String, dynamic>{
      'ratingAvg': ?instance.ratingAvg,
      'ratingCount': instance.ratingCount,
      'distribution': instance.distribution.map((e) => e.toJson()).toList(),
    };
