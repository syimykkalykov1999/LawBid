// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rating_bucket_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RatingBucketDto _$RatingBucketDtoFromJson(Map<String, dynamic> json) =>
    RatingBucketDto(
      stars: (json['stars'] as num).toInt(),
      count: (json['count'] as num).toInt(),
    );

Map<String, dynamic> _$RatingBucketDtoToJson(RatingBucketDto instance) =>
    <String, dynamic>{'stars': instance.stars, 'count': instance.count};
