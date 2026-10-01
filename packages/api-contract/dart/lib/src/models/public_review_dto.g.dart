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
      fromCase: json['fromCase'] as bool,
      authorRole: ReviewAuthorRole.fromJson(json['authorRole'] as String),
      reply: json['reply'] as String?,
      replyAt: json['replyAt'] == null
          ? null
          : DateTime.parse(json['replyAt'] as String),
      helpfulCount: (json['helpfulCount'] as num).toInt(),
      helpfulByMe: json['helpfulByMe'] as bool,
      isMine: json['isMine'] as bool,
      photos: (json['photos'] as List<dynamic>)
          .map((e) => ReviewPhotoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      authorAvatarUrl: json['authorAvatarUrl'] as String?,
      authorReviewCount: (json['authorReviewCount'] as num).toInt(),
    );

Map<String, dynamic> _$PublicReviewDtoToJson(PublicReviewDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'rating': instance.rating,
      'body': ?instance.body,
      'authorDisplayName': ?instance.authorDisplayName,
      'createdAt': instance.createdAt.toIso8601String(),
      'editedAt': ?instance.editedAt?.toIso8601String(),
      'fromCase': instance.fromCase,
      'authorRole': instance.authorRole.toJson(),
      'reply': ?instance.reply,
      'replyAt': ?instance.replyAt?.toIso8601String(),
      'helpfulCount': instance.helpfulCount,
      'helpfulByMe': instance.helpfulByMe,
      'isMine': instance.isMine,
      'photos': instance.photos.map((e) => e.toJson()).toList(),
      'authorAvatarUrl': ?instance.authorAvatarUrl,
      'authorReviewCount': instance.authorReviewCount,
    };
