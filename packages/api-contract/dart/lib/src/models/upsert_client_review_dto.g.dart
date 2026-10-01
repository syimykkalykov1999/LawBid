// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upsert_client_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpsertClientReviewDto _$UpsertClientReviewDtoFromJson(
  Map<String, dynamic> json,
) => UpsertClientReviewDto(
  rating: json['rating'] as num,
  body: json['body'] as String?,
  photoIds: (json['photoIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$UpsertClientReviewDtoToJson(
  UpsertClientReviewDto instance,
) => <String, dynamic>{
  'rating': instance.rating,
  'body': ?instance.body,
  'photoIds': ?instance.photoIds,
};
