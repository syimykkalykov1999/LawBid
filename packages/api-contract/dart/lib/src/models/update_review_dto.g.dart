// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateReviewDto _$UpdateReviewDtoFromJson(Map<String, dynamic> json) =>
    UpdateReviewDto(
      rating: (json['rating'] as num?)?.toInt(),
      body: json['body'] as String?,
    );

Map<String, dynamic> _$UpdateReviewDtoToJson(UpdateReviewDto instance) =>
    <String, dynamic>{'rating': ?instance.rating, 'body': ?instance.body};
