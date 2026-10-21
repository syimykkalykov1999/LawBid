// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shared_post_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SharedPostCardDto _$SharedPostCardDtoFromJson(Map<String, dynamic> json) =>
    SharedPostCardDto(
      id: json['id'] as String,
      isVideo: json['isVideo'] as bool,
      available: json['available'] as bool,
      author: json['author'] == null
          ? null
          : SharedPostAuthorDto.fromJson(
              json['author'] as Map<String, dynamic>,
            ),
      title: json['title'] as String?,
      excerpt: json['excerpt'] as String?,
      thumbnailUrl: json['thumbnailUrl'] as String?,
    );

Map<String, dynamic> _$SharedPostCardDtoToJson(SharedPostCardDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'author': ?instance.author?.toJson(),
      'title': ?instance.title,
      'excerpt': ?instance.excerpt,
      'thumbnailUrl': ?instance.thumbnailUrl,
      'isVideo': instance.isVideo,
      'available': instance.available,
    };
