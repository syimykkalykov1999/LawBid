// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateReviewDto _$UpdateReviewDtoFromJson(Map<String, dynamic> json) =>
    UpdateReviewDto(
      rating: (json['rating'] as num?)?.toInt(),
      body: json['body'] as String?,
      photoIds: (json['photoIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$UpdateReviewDtoToJson(UpdateReviewDto instance) =>
    <String, dynamic>{
      'rating': ?instance.rating,
      'body': ?instance.body,
      'photoIds': ?instance.photoIds,
    };
