// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateReviewDto _$CreateReviewDtoFromJson(Map<String, dynamic> json) =>
    CreateReviewDto(
      rating: (json['rating'] as num).toInt(),
      body: json['body'] as String?,
      photoIds: (json['photoIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$CreateReviewDtoToJson(CreateReviewDto instance) =>
    <String, dynamic>{
      'rating': instance.rating,
      'body': ?instance.body,
      'photoIds': ?instance.photoIds,
    };
