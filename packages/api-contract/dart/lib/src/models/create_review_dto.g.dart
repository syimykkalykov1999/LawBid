// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateReviewDto _$CreateReviewDtoFromJson(Map<String, dynamic> json) =>
    CreateReviewDto(
      rating: (json['rating'] as num).toInt(),
      body: json['body'] as String?,
    );

Map<String, dynamic> _$CreateReviewDtoToJson(CreateReviewDto instance) =>
    <String, dynamic>{'rating': instance.rating, 'body': ?instance.body};
