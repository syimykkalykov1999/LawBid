// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_post_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedPostItemDto _$SavedPostItemDtoFromJson(Map<String, dynamic> json) =>
    SavedPostItemDto(
      postId: json['postId'] as String,
      savedAt: json['savedAt'] as String,
      available: json['available'] as bool,
      post: json['post'] == null
          ? null
          : PostDto.fromJson(json['post'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SavedPostItemDtoToJson(SavedPostItemDto instance) =>
    <String, dynamic>{
      'postId': instance.postId,
      'savedAt': instance.savedAt,
      'available': instance.available,
      'post': ?instance.post?.toJson(),
    };
