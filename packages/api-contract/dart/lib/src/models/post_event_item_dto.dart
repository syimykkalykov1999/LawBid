// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_event_item_dto_kind.dart';

part 'post_event_item_dto.g.dart';

@JsonSerializable()
class PostEventItemDto {
  const PostEventItemDto({
    required this.postId,
    required this.kind,
  });
  
  factory PostEventItemDto.fromJson(Map<String, Object?> json) => _$PostEventItemDtoFromJson(json);
  
  final String postId;
  final PostEventItemDtoKind kind;

  Map<String, Object?> toJson() => _$PostEventItemDtoToJson(this);
}
