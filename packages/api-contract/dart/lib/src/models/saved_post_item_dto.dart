// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_dto.dart';

part 'saved_post_item_dto.g.dart';

@JsonSerializable()
class SavedPostItemDto {
  const SavedPostItemDto({
    required this.postId,
    required this.savedAt,
    required this.available,
    this.post,
  });

  factory SavedPostItemDto.fromJson(Map<String, Object?> json) =>
      _$SavedPostItemDtoFromJson(json);

  final String postId;
  final String savedAt;
  final bool available;
  final PostDto? post;

  Map<String, Object?> toJson() => _$SavedPostItemDtoToJson(this);
}
