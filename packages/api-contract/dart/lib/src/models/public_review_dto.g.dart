// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicReviewDto _$PublicReviewDtoFromJson(Map<String, dynamic> json) =>
    PublicReviewDto(
      id: json['id'] as String,
      rating: (json['rating'] as num).toInt(),
      body: json['body'] as String?,
      authorDisplayName: json['authorDisplayName'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      editedAt: json['editedAt'] == null
          ? null
          : DateTime.parse(json['editedAt'] as String),
    );

Map<String, dynamic> _$PublicReviewDtoToJson(PublicReviewDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'rating': instance.rating,
      'body': ?instance.body,
      'authorDisplayName': ?instance.authorDisplayName,
      'createdAt': instance.createdAt.toIso8601String(),
      'editedAt': ?instance.editedAt?.toIso8601String(),
    };
