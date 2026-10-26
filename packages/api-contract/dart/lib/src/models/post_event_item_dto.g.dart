// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_event_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostEventItemDto _$PostEventItemDtoFromJson(Map<String, dynamic> json) =>
    PostEventItemDto(
      postId: json['postId'] as String,
      kind: PostEventItemDtoKind.fromJson(json['kind'] as String),
    );

Map<String, dynamic> _$PostEventItemDtoToJson(PostEventItemDto instance) =>
    <String, dynamic>{
      'postId': instance.postId,
      'kind': instance.kind.toJson(),
    };
