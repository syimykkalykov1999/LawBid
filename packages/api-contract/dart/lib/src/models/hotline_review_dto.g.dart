// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineReviewDto _$HotlineReviewDtoFromJson(Map<String, dynamic> json) =>
    HotlineReviewDto(
      stars: json['stars'] as num,
      comment: json['comment'] as String?,
    );

Map<String, dynamic> _$HotlineReviewDtoToJson(HotlineReviewDto instance) =>
    <String, dynamic>{'stars': instance.stars, 'comment': ?instance.comment};
